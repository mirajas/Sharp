import express from "express";
import sharp from "sharp";
import dns from "dns/promises";
import net from "net";
import rateLimit from "express-rate-limit";

const app = express();
app.use(express.json({ limit: "1mb" }));

/* -------------------- CONFIG -------------------- */

const ALLOWED_HOSTS = [
  "bkend-minio.circleinc.in",
  "circleinc.in",
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 5000;

/* -------------------- RATE LIMIT -------------------- */

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60, // 60 req per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

/* -------------------- SECURITY HELPERS -------------------- */

function isPrivateIP(ip) {
  if (!net.isIP(ip)) return true;

  if (ip.startsWith("10.")) return true;
  if (ip.startsWith("127.")) return true;
  if (ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;

  if (ip.startsWith("172.")) {
    const second = parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

async function validateUrlSecurity(rawUrl) {
  let parsed;

  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL format");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS URLs are allowed");
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    throw new Error("Domain not allowed");
  }

  // Resolve DNS and block private IPs
  const addresses = await dns.lookup(parsed.hostname, { all: true });

  for (const addr of addresses) {
    if (isPrivateIP(addr.address)) {
      throw new Error("Access to private IP ranges is not allowed");
    }
  }

  return parsed;
}

async function fetchImageSecure(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(url, { signal: controller.signal });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error("Failed to fetch image");
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.startsWith("image/")) {
    throw new Error("URL does not point to a valid image");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
    throw new Error("Image exceeds 10MB limit");
  }

  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
    throw new Error("Image exceeds 10MB limit");
  }

  return Buffer.from(arrayBuffer);
}

/* -------------------- OVERLAY ROUTE -------------------- */

app.post("/overlay", async (req, res) => {
  try {
    const {
      imageUrl,
      logoUrl,
      position = "top-right",
      logoWidth = 0.2,
      addShadow = false,
    } = req.body;

    if (!imageUrl || !logoUrl) {
      return res.status(400).json({
        error: "imageUrl and logoUrl are required",
      });
    }

    await validateUrlSecurity(imageUrl);
    await validateUrlSecurity(logoUrl);

    const baseImageBuffer = await fetchImageSecure(imageUrl);
    const logoBufferRaw = await fetchImageSecure(logoUrl);

    const baseImage = sharp(baseImageBuffer);
    const metadata = await baseImage.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid base image");
    }

    const baseWidth = metadata.width;

    const calculatedLogoWidth =
      logoWidth <= 1
        ? Math.floor(baseWidth * logoWidth)
        : parseInt(logoWidth);

    let processedLogo = sharp(logoBufferRaw)
      .resize({ width: calculatedLogoWidth })
      .png();

    if (addShadow) {
      const shadow = await sharp(logoBufferRaw)
        .resize({ width: calculatedLogoWidth })
        .blur(8)
        .modulate({ brightness: 0.3 })
        .png()
        .toBuffer();

      const logoWithShadow = await sharp({
        create: {
          width: calculatedLogoWidth,
          height: calculatedLogoWidth,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite([
          { input: shadow, top: 10, left: 10 },
          { input: await processedLogo.toBuffer(), top: 0, left: 0 },
        ])
        .png()
        .toBuffer();

      processedLogo = sharp(logoWithShadow);
    }

    const finalLogoBuffer = await processedLogo.toBuffer();

    const gravityMap = {
      "top-right": "northeast",
      "top-left": "northwest",
      "bottom-right": "southeast",
      "bottom-left": "southwest",
      center: "center",
    };

    const finalImage = await sharp(baseImageBuffer)
      .composite([
        {
          input: finalLogoBuffer,
          gravity: gravityMap[position] || "northeast",
        },
      ])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(finalImage);

  } catch (error) {
    console.error("Overlay Error:", error.message);

    res.status(500).json({
      error: "Image processing failed",
    });
  }
});

/* -------------------- HEALTH CHECK -------------------- */

app.get("/", (req, res) => {
  res.json({ status: "Image Overlay Service Running" });
});

/* -------------------- START SERVER -------------------- */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Image overlay service running on port ${PORT}`);
});
