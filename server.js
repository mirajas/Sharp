import express from "express";
import sharp from "sharp";

const app = express();
app.use(express.json({ limit: "50mb" }));

app.post("/overlay", async (req, res) => {
  try {
    console.log("---- Incoming Request ----");
    console.log("Headers:", req.headers["content-type"]);
    console.log("Body keys:", Object.keys(req.body));

    const { imageBase64, logoBase64 } = req.body;

    console.log("imageBase64 type:", typeof imageBase64);
    console.log("logoBase64 type:", typeof logoBase64);

    if (imageBase64) {
      console.log("imageBase64 first 50 chars:", imageBase64.substring(0, 50));
      console.log("imageBase64 length:", imageBase64.length);
    }

    if (logoBase64) {
      console.log("logoBase64 first 50 chars:", logoBase64.substring(0, 50));
      console.log("logoBase64 length:", logoBase64.length);
    }

    if (!imageBase64 || !logoBase64) {
      return res.status(400).json({
        error: "imageBase64 and logoBase64 are required"
      });
    }

    // STOP here temporarily for debugging
    return res.json({ debug: "Check server logs" });

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
