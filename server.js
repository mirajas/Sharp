import express from "express";
import sharp from "sharp";

const app = express();
app.use(express.json({ limit: "5mb" })); // No more huge base64

app.post("/overlay", async (req, res) => {
  try {
    const {
      imageUrl,
      logoUrl,
      position = "top-right",
      logoWidth = 0.2,
      addShadow = false
    } = req.body;

    if (!imageUrl || !logoUrl) {
      return res.status(400).json({
        error: "imageUrl and logoUrl are required"
      });
    }

    // Fetch images directly
    const baseImageBuffer = await fetch(imageUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b));
    const logoBufferRaw = await fetch(logoUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b));

    const baseImage = sharp(baseImageBuffer);
    const metadata = await baseImage.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Invalid base image");
    }

    const baseWidth = metadata.width;

    let calculatedLogoWidth = logoWidth <= 1
      ? Math.floor(baseWidth * logoWidth)
      : logoWidth;

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

    const gravityMap = {
      "top-right": "northeast",
      "top-left": "northwest",
      "bottom-right": "southeast",
      "bottom-left": "southwest",
      "center": "center"
    };

    const finalImage = await sharp(baseImageBuffer)
      .composite([{
        input: finalLogoBuffer,
        gravity: gravityMap[position] || "northeast"
      }])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(finalImage);
  } catch (error) {
    console.error("Overlay Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log("Image overlay service running on port 3000");
});
