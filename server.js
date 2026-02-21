import express from "express";
import sharp from "sharp";
import axios from "axios";

const app = express();
app.use(express.json({ limit: "25mb" }));

app.post("/overlay", async (req, res) => {
  try {
    const {
      imageUrl,
      logoUrl,
      position = "top-right",
      padding = 40,
      logoWidth = 0.15, // Default = 15% of image width
      x = null,
      y = null,
      addShadow = false
    } = req.body;

    if (!imageUrl || !logoUrl) {
      return res.status(400).json({ error: "imageUrl and logoUrl required" });
    }

    // Download base image
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer"
    });

    // Download logo
    const logoResponse = await axios.get(logoUrl, {
      responseType: "arraybuffer"
    });

    const baseImageBuffer = Buffer.from(imageResponse.data);
    const baseImage = sharp(baseImageBuffer);
    const metadata = await baseImage.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Could not determine base image dimensions");
    }

    // Calculate dynamic logo width
    let finalLogoWidth;
    if (logoWidth <= 1) {
      // Treat as percentage
      finalLogoWidth = Math.round(metadata.width * logoWidth);
    } else {
      // Treat as fixed pixel size
      finalLogoWidth = logoWidth;
    }

    let logoSharp = sharp(Buffer.from(logoResponse.data))
      .resize({ width: finalLogoWidth })
      .png();

    // Optional shadow
    if (addShadow) {
      const shadow = await logoSharp
        .clone()
        .flatten({ background: "#000000" })
        .blur(10)
        .toBuffer();

      const logoBuffer = await logoSharp.toBuffer();

      logoSharp = sharp({
        create: {
          width: finalLogoWidth + 20,
          height: finalLogoWidth + 20,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
      }).composite([
        { input: shadow, top: 10, left: 10, opacity: 0.4 },
        { input: logoBuffer, top: 0, left: 0 }
      ]);
    }

    const logoBufferFinal = await logoSharp.toBuffer();

    // Position mapping
    const gravityMap = {
      "top-right": "northeast",
      "top-left": "northwest",
      "bottom-right": "southeast",
      "bottom-left": "southwest",
      "center": "center"
    };

    let compositeOptions;

    // Custom pixel placement
    if (x !== null && y !== null) {
      compositeOptions = {
        input: logoBufferFinal,
        top: y,
        left: x
      };
    } else {
      compositeOptions = {
        input: logoBufferFinal,
        gravity: gravityMap[position] || "northeast",
        top: padding,
        left: padding
      };
    }

    const finalImage = await baseImage
      .composite([compositeOptions])
      .png({ compressionLevel: 9 })
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(finalImage);

  } catch (error) {
    console.error("Overlay error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("Image Overlay Service Running 🚀");
});

app.listen(3000, () => {
  console.log("Image overlay service running on port 3000");
});
