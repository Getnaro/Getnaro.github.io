const express = require("express");
const app = express();
const cors = require("cors");

app.use(cors());
app.use(express.raw({limit: '500mb', type: "*/*"}));

// ---------------- PING TEST ----------------
app.get("/ping", (req, res) => {
    res.send("pong");
});

// ---------------- DOWNLOAD TEST ----------------
// This generates large random data for real-speed download
app.get("/download", (req, res) => {
    res.setHeader("Content-Type", "application/octet-stream");

    const sizeMB = Number(req.query.size) || 50; // default 50MB
    const chunk = Buffer.alloc(1024 * 1024, "A"); // 1MB

    let sent = 0;

    function sendChunk() {
        if (sent >= sizeMB) {
            res.end();
            return;
        }
        res.write(chunk);
        sent++;
        setImmediate(sendChunk);
    }

    sendChunk();
});

// ---------------- UPLOAD TEST ----------------
app.post("/upload", (req, res) => {
    const bytes = req.body.length;
    res.json({received: bytes});
});

// Run server
app.listen(3000, () => {
    console.log("Speedtest backend running on http://localhost:3000");
});
