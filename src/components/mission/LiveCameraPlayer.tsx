import { useEffect, useRef, useState } from "react";
import { VideoOff } from "lucide-react";

const SIGNAL_URL = import.meta.env.VITE_CAMERA_WEBRTC_URL as string | undefined;
type IceServer = { urls: string | string[]; username?: string; credential?: string };

export default function LiveCameraPlayer() {
  const video = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState(SIGNAL_URL ? "Connecting…" : "Camera stream not configured");

  useEffect(() => {
    if (!SIGNAL_URL) return;
    let cancelled = false;
    let pc: RTCPeerConnection | null = null;
    const connect = async () => {
      try {
        const base = SIGNAL_URL.replace(/\/$/, "");
        // Credentials expire. Request a new set for every viewer session.
        const credentialResponse = await fetch(base + "/ice-servers", { cache: "no-store" });
        if (!credentialResponse.ok) throw new Error("TURN unavailable (HTTP " + credentialResponse.status + ")");
        const payload = await credentialResponse.json() as { iceServers?: IceServer[] };
        if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
          throw new Error("TURN server configuration missing");
        }
        if (cancelled) return;
        pc = new RTCPeerConnection({ iceServers: payload.iceServers });
        const peer = pc;
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.ontrack = event => {
          if (video.current && event.streams[0]) {
            video.current.srcObject = event.streams[0];
            void video.current.play().catch(() => {
              if (!cancelled) setStatus("Tap video to start playback");
            });
          }
        };
        peer.onconnectionstatechange = () => {
          if (cancelled) return;
          if (peer.connectionState === "connected") setStatus("Live");
          if (["failed", "disconnected", "closed"].includes(peer.connectionState)) setStatus("Camera disconnected");
        };
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        if (peer.iceGatheringState !== "complete") {
          await new Promise<void>(resolve => {
            const timeout = setTimeout(resolve, 8000);
            const listener = () => {
              if (peer.iceGatheringState === "complete") {
                clearTimeout(timeout);
                resolve();
              }
            };
            peer.addEventListener("icegatheringstatechange", listener);
          });
        }
        if (cancelled) return;
        const response = await fetch(base + "/offer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: peer.localDescription?.type, sdp: peer.localDescription?.sdp }),
        });
        if (!response.ok) throw new Error("Camera signaling failed (HTTP " + response.status + ")");
        const answer = await response.json();
        if (!cancelled) await peer.setRemoteDescription(answer);
      } catch (err) {
        if (!cancelled) setStatus(err instanceof Error ? err.message : "Camera connection failed");
      }
    };
    void connect();
    return () => {
      cancelled = true;
      pc?.close();
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
