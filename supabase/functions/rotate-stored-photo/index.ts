// Admin-only Supabase Edge Function. Rotate one existing image by 180 degrees.
// Dry run is the default. This function backs up the original before replacing it.
// Set ROTATE_ADMIN_TOKEN as a Supabase Function secret (never a frontend env variable).
import { createClient } from "npm:@supabase/supabase-js@2";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@^0";

// Edge runtime disallows Deno.readFile inside an HTTP request callback.
// Read WASM synchronously during module initialization (allowed), but catch errors
// so the worker can still respond with a useful JSON diagnostic.
let wasmBytes: Uint8Array | undefined;
let wasmLoadError: string | undefined;
try {
  wasmBytes = Deno.readFileSync(new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@^0")));
} catch (error) {
  wasmLoadError = error instanceof Error ? error.message : String(error);
}
let magickReady: Promise<void> | undefined;
function ensureMagick(): Promise<void> {
  if (!wasmBytes) return Promise.reject(Error("WASM load failed: " + wasmLoadError));
  if (!magickReady) {
    magickReady = initializeImageMagick(wasmBytes)
      .catch(error => { magickReady = undefined; throw error; });
  }
  return magickReady;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  const secret = Deno.env.get("ROTATE_ADMIN_TOKEN");
  if (!secret || req.headers.get("x-rotation-token") !== secret)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  let stage = "parse_request";
  try {
    const body =  await req.json() as { path?: string; confirm?: boolean };
    const path = body.path?.replace(/^\/+/, "");
    if (!path || !/\.jpe?g$/i.test(path) || path.includes("..") || path.startsWith("_rotation_backups/"))
      return Response.json({ error: "A valid JPEG path in image_readings is required" }, { status: 400 });
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bucket = client.storage.from("image_readings");
    const backupPath = "_rotation_backups/" + path;

    // Backups also serve as the permanent rotation manifest. A file is never rotated twice.
    stage = "check_backup";
    const { data: existing } = await bucket.info(backupPath);
    if (existing) return Response.json({ status: "already_backed_up_or_rotated", path, backupPath });

    if (body.confirm !== true)
      return Response.json({ status: "dry_run", path, backupPath, message: "Submit confirm=true to back up and rotate this JPEG." });

    stage = "download_original";
    const { data: original, error: downloadError } = await bucket.download(path);
    if (downloadError || !original) throw downloadError ?? Error("File unavailable");
    const raw = new Uint8Array(await original.arrayBuffer());
    stage = "initialize_imagemagick";
    await ensureMagick();
    stage = "rotate_image";
    const rotated = ImageMagick.read(raw, image => {
      image.rotate(180);
      return image.write(MagickFormat.Jpeg, data => Uint8Array.from(data));
    });

    stage = "upload_backup";
    const { error: backupError } = await bucket.upload(backupPath, raw, {
      contentType: "image/jpeg", upsert: false, cacheControl: "3600"
    });
    if (backupError) throw Error("Backup failed; original was not touched: " + backupError.message);

    stage = "replace_original";
    const { error: updateError } = await bucket.update(path, rotated, {
      contentType: "image/jpeg", cacheControl: "60"
    });
    if (updateError) throw Error("Backup saved but replacement failed: " + updateError.message);

    return Response.json({ status: "rotated", path, backupPath, bytes: rotated.length });
  } catch (err) {
    return Response.json({ stage, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});
