const response = require("../response");
const fs = require("fs");
const path = require("path");

module.exports = (service) => {
    service.clipsPath = path.join(global.rootDir, service.config.clipsLocation);
    if (!fs.existsSync(service.clipsPath)) fs.mkdirSync(service.clipsPath);

    service.on("visit", (content, res) => {
        if (!fs.existsSync(content.filePath)) return new response.errors.serverError(res);
        const stream = fs.createReadStream(content.filePath);
        res.setHeader("Content-Type", content.mimeType);
        stream.on("data", data => {
            res.writeLarge(data);
        });
        stream.on("end", () => {
            res.end();
        });
        stream.on("error", err => {
            new response.errors.serverError(res)
        });
    });

    service.on("create", (content, buffer, req, res) => {
        const ext = /video\/(.+)/.exec(req.headers["content-type"])?.[1];
        // content.id += ext ? `.${ext}` : "";
        const filePath = path.join(service.clipsPath, `${content.id}${ext ? `.${ext}` : ""}`);
        fs.writeFileSync(filePath, buffer);
        content.filePath = filePath;
        content.mimeType = req.headers["content-type"];
        return new response.success.created(res, { name: "clip", id: content.id });
    });
}