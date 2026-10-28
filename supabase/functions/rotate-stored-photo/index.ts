// Admin-only Supabase Edge Function. Rotate one existing image by 180 degrees.
// Dry run is the default. This function backs up the original before replacing it.
// Set ROTATE_ADMIN_TOKEN as a Supabase Function secret (never a frontend env variable).
import { createClient } from "npm:@supabase/supabase-js@2";
import jpeg from "npm:jpeg-js@0.4.4";

// Pure JavaScript JPEG decoding/encoding: no external .wasm file to package.
// The pixel array is reversed in RGBA-sized units to rotate exactly 180 degrees.
function rotateJpeg180(input: Uint8Array): Uint8Array {
  const decoded = jpeg.decode(input, { useTArray: true, maxResolutionInMP: 12, maxMemoryUsageInMB: 256 });
  const pixels = decoded.data;
  const result = new Uint8Array(pixels.length);
  for (let i = 0, j = pixels.length - 4; i < pixels.length; i += 4, j -= 4) {
    result[i] = pixels[j];
    result[i + 1] = pixels[j + 1];
    result[i + 2] = pixels[j + 2];
    result[i + 3] = pixels[j + 3];
  }
  return Uint8Array.from(jpeg.encode({ data: result, width: decoded.width, height: decoded.height }, 90).data);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  const secret = Deno.env.get("ROTATE_ADMIN_TOKEN");
  if (!secret || req.headers.get("x-rotation-token") !== secret)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  let stage = "parse_request";
  try {
    const body = await req.json() as { action?: string; path?: string; confirm?: boolean; prefix?: string; offset?: number };
    if (body.action === "list") {
      // Paginated listing: the caller follows folders and pages without a service-role key.
      const prefix = (body.prefix ?? "").replace(/^\/+|\/+$/g, "");
      if (prefix.includes("..") || prefix === "_rotation_backups" || prefix.startsWith("_rotation_backups/"))
        return Response.json({ error: "Invalid listing prefix" }, { status: 400 });
      const offset = Number.isInteger(body.offset) && body.offset! >= 0 ? body.offset! : 0;
      if (offset > 100000) return Response.json({ error: "Offset too large" }, { status: 400 });
      const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data, error } = await client.storage.from("image_readings").list(prefix, {
        limit: 100, offset, sortBy: { column: "name", order: "asc" }
      });
      if (error) throw error;
      const entries = (data ?? []).filter(item => !(prefix === "" && item.name === "_rotation_backups")).map(item => ({
        path: [prefix, item.name].filter(Boolean).join("/"),
        folder: !item.id,
        jpeg: /\.jpe?g$/i.test(item.name)
      }));
      return Response.json({ status: "listed", entries, hasMore: (data ?? []).length === 100 });
    }
    const path = body.path?.replace(/^\/+/, "");
    if (!path || !/\.jpe?g$/i.test(path) || path.includes("..") || path.startsWith("_rotation_backups/"))
      return Response.json({ error: "A valid JPEG path in image_readings is required" }, { status: 400 });
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const bucket = client.storage.from("image_readings");
    const backupPath = "_rotation_backups/" + path;

    // Backups also serve as the permanent rotation manifest. A file is never rotated twice.
    stage = "check_backup";
    const { data: existing } = await bucket.info(backupPath);
    if (existing) return Response.json({ status: "backup_exists_review_before_retry", path, backupPath });

    if (body.confirm !== true)
      return Response.json({ status: "dry_run", path, backupPath, message: "Submit confirm=true to back up and rotate this JPEG." });

    stage = "download_original";
    const { data: original, error: downloadError } = await bucket.download(path);
    if (downloadError || !original) throw downloadError ?? Error("File unavailable");
    const raw = new Uint8Array(await original.arrayBuffer());
    stage = "rotate_image";
    const rotated = rotateJpeg180(raw);

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
