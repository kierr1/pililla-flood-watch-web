import { useEffect, useRef, useState } from "react";
import { VideoOff } from "lucide-react";

const SIGNAL_URL = import.meta.env.VITE_CAMERA_WEBRTC_URL as string | undefined;
type IceServer = { urls: string | string[]; username?: string; credential?: string };

function configuredIce(): IceServer[] {
  try {
    const data = JSON.parse(import.meta.env.VITE_CAMERA_ICE_SERVERS || "[]");
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export default function LiveCameraPlayer() {
  const video = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState(SIGNAL_URL ? "Connecting…" : "Camera stream not configured");
  useEffect(() => {
    if (!SIGNAL_URL) return;
    let cancelled = false;
    const pc = new RTCPeerConnection({ iceServers: configuredIce() });
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.ontrack = event => {
      if (video.current && event.streams[0]) {
        video.current.srcObject = event.streams[0];
        void video.current.play().catch(() => setStatus("Tap video to start playback"));
      }
    };
    pc.onconnectionstatechange = () => {
      if (cancelled) return;
      if (pc.connectionState === "connected") setStatus("Live");
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) setStatus("Camera disconnected");
    };
    const connect = async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // Wait for ICE gathering before signaling; supports trickle-free aiortc endpoint.
        if (pc.iceGatheringState !== "complete") {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 8000);
            pc.addEventListener("icegatheringstatechange", () => {
              if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
            });
          });
        }
        const response = await fetch(SIGNAL_URL.replace(/\/$/, "") + "/offer", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: pc.localDescription?.type, sdp: pc.localDescription?.sdp }),
        });
        if (!response.ok) throw new Error("Signaling failed: " + response.status);
        const answer = await response.json();
        if (!cancelled) await pc.setRemoteDescription(answer);
      } catch (err) {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Camera connection failed");
      }
    };
    void connect();
    return () => {
      cancelled = true;
      pc.close();
      if (video.current) video.current.srcObject = null;
    };
  }, []);

  return (
    <div className="mx-auto max-w-4xl overflow-hidden rounded border border-primary/20 bg-black">
      <div className="relative aspect-video w-full">
        <video ref={video} autoPlay playsInline muted controls className="h-full w-full object-contain" />
        {status !== "Live" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-6 text-center">
          <VideoOff className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-foreground">{status}</p>
        </div>}
      </div>
      <p className="px-3 py-2 text-xs text-muted-foreground">{status === "Live" ? "Live Raspberry Pi camera" : status}</p>
    </div>
  );
}
