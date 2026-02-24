import express from "express";
import sharp from "sharp";

const app = express();
app.use(express.json({ limit: "50mb" }));

app.post("/overlay", async (req, res) => {
  try {
    const {
      imageBase64,
      logoBase64,
      position = "top-right",
      padding = 40,
      logoWidth = 0.2,      // 20% of base image width OR px if > 1
      addShadow = false
    } = req.body;

    if (!imageBase64 || !logoBase64) {
      return res.status(400).json({
        error: "imageBase64 and logoBase64 are required"
      });
    }

    // Remove data:image/png;base64, if present
    const cleanBase64 = (str) =>
      str.replace(/^data:image\/\w+;base64,/, "");

    const baseImageBuffer = Buffer.from(cleanBase64(imageBase64), "base64");
    const logoBufferRaw = Buffer.from(cleanBase64(logoBase64), "base64");

    // Get base image metadata
    const baseImage = sharp(baseImageBuffer);
    const metadata = await baseImage.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid base image");
    }

    const baseWidth = metadata.width;

    // Determine logo width
    let calculatedLogoWidth;

    if (logoWidth <= 1) {
      // Percentage mode
      calculatedLogoWidth = Math.floor(baseWidth * logoWidth);
    } else {
      // Pixel mode
      calculatedLogoWidth = logoWidth;
    }

    // Resize logo
    let processedLogo = sharp(logoBufferRaw)
      .resize({ width: calculatedLogoWidth })
      .png();

    // Add shadow if enabled
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
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      })
        .composite([
          { input: shadow, top: 10, left: 10 },
          { input: await processedLogo.toBuffer(), top: 0, left: 0 }
        ])
        .png()
        .toBuffer();

      processedLogo = sharp(logoWithShadow);
    }

    const finalLogoBuffer = await processedLogo.toBuffer();

    // Position mapping
    const gravityMap = {
      "top-right": "northeast",
      "top-left": "northwest",
      "bottom-right": "southeast",
      "bottom-left": "southwest",
      "center": "center"
    };

    const compositeOptions = {
      input: finalLogoBuffer,
      gravity: gravityMap[position] || "northeast"
    };

    // Apply overlay
    const finalImage = await sharp(baseImageBuffer)
      .composite([compositeOptions])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(finalImage);

  } catch (error) {
    console.error("Overlay Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.json({ status: "Image Overlay Service Running 🚀" });
});

app.listen(3000, () => {
  console.log("Image overlay service running on port 3000");
});
