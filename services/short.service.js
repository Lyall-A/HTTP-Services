const response = require("../response");

module.exports = (service) => {
    service.on("visit", (content, res) => {
        res.redirect(content.url);
    });

    service.on("create", (content, buffer, req, res) => {
        const json = JSON.parse(buffer);
        if (json.url == undefined) return response.sendError(res, 400, 0, "URL not provided!");
        if (!/^(http:|https:)\/\/.+/i.test(json.url)) return response.sendError(res, 400, 0, "URL is not HTTP!");
        content.url = json.url;
        return new response.success.created(res, { name: "short link", id: content.id });
    });
}