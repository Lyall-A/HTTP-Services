const Server = require("./http/Server");
const path = require("path");
const fs = require("fs");

const config = require("./config.json");
const response = require("./response");

const services = [ ];

global.rootDir = __dirname;

for (const serviceConfig of config.services) {
    const service = {
        config: {
            ...config.defaultsServiceConfig,
            ...serviceConfig
        },
        server: new Server(),
        listeners: [],
        on: (event, callback) => {
            service.listeners.push({ event, callback, once: false });
        },
        once: (event, callback) => {
            service.listeners.push({ event, callback, once: true });
        },
        call: async (event, ...data) => {
            for (const listenerIndex in service.listeners) {
                const listener = service.listeners[listenerIndex];
                if (listener.event != event) continue;
                await listener.callback(...data);
                if (listener.once) service.listeners.splice(listenerIndex, 1);
            }
        },
    };
    service.name = service.config.name;
    service.storePath = path.join(rootDir, service.config.storeLocation);
    service.scriptPath = path.join(rootDir, service.config.serviceScriptLocation);
    service.log = (...msgs) => {
        log(`${service.name} -`, ...msgs);
    }
    service.saveStore = (key, data) => {
        if (!service.store) service.store = { };
        if (!service.store.content) service.store.content = [];
        if (!service.store.users) service.store.users = [];

        if (key && data) (service.store[key].push(...data));

        fs.writeFileSync(service.storePath, JSON.stringify(service.store));
    }
    service.readStore = () => {
        if (!fs.existsSync(service.storePath)) return service.saveStore();
        try {
            return service.store = JSON.parse(fs.readFileSync(service.storePath, "utf-8"));
        } catch (err) {
            service.log("Failed to read store file! Backing up and resetting");
            fs.cpSync(service.storePath, `${service.storePath}.bak`);
            return service.saveStore();
        }
    }
    service.findContent = (id) => {
        const found = service.store.content?.find(i => i?.id == id);
        return found || null;
    }
    service.genId =  (attempts = 1) => {
        let id = "";
        for (let i = 0; i < service.config.idLength; i++) {
            id += service.config.idChars[Math.floor(Math.random() * service.config.idChars.length)];
        }
        if (service.findContent(id)) {
            // If ID already exists, can try up to 10 times
            if (attempts < 10) return genId(attempts + 1);
            throw new Error(`Couldn't generate new ID in ${attempts} tries!`);
        } else return id;
    }
    service.app = service.server.router;

    const { server, app, scriptPath, readStore, findContent } = service;

    readStore();

    app.post("/", (req, res) => {
        if (!req.headers["content-type"]) return new response.errors.missingType(res);
        if (service.config.allowedMimes && !service.config.allowedMimes.find(i => new RegExp(`^${i}$`).test(req.headers["content-type"]))) return new response.errors.contentTypeNotAllowed(res);
        if (service.config.disallowedMimes && service.config.disallowedMimes.find(i => new RegExp(`^${i}$`).test(req.headers["content-type"]))) return new response.errors.contentTypeNotAllowed(res);
        
        if (!req.headers["content-length"]) return new response.errors.missingLength(res);
        if (service.config.sizeLimit && req.headers["content-length"] > service.config.sizeLimit) return new response.errors.dataTooLarge(res);

        let data = [ ];
        req.on("data", i => {
            data.push(i);
            if (service.config.sizeLimit && data.length > service.config.sizeLimit) return new response.errors.dataTooLarge(res);
        });
        req.on("end", () => {
            const buffer = Buffer.concat(data);
            const content = {
                id: service.genId(),
                creationDate: Date.now(),
            };
            service.call("create", content, buffer, req, res).then(() => {
                service.log(`Created content with ID '${content.id}'`);
                service.saveStore("content", [content]);
            }).catch(err => {
                service.log(`Failed creating content with ID '${content.id}', Error:`, err);
                return new response.errors.serverError(res);
            });
        });
    });

    app.get("/:id/", (req, res, next, params) => {
        const content = findContent(params.id);
        if (content == null) return new response.errors.idNotFound(res, { params });
        service.call("visit", content, res).then(() => {
            service.log(`Someone visited content with ID '${content.id}'`);
        }).catch(err => {
            service.log(`Failed to visit content with ID '${content.id}, Error:`, err);
            return new response.errors.serverError(res);
        });
    });
    
    app.get("*", (req, res) => {
        res.sendStatus(404);
    });

    server.listen(service.config.port, () => log(`Started server for service '${service.name}' at :${service.config.port}`));

    require(scriptPath)(service);
    services.push(service);
}

function timestamp() {
    return new Date().toUTCString();
}

function log(...msg) {
    console.log(`[${timestamp()}] -`, ...msg);
}

function checkExpired() {
    const date = Date.now();
    for (const service of services) {
        try {
            const expireAfter = service.config.expireAfter;
            if (!expireAfter) continue;
            let foundExpired = 0;
            for (const contentIndex in service.store.content) {
                const content = service.store.content[contentIndex];
                if (content.deleted) continue;
                if (date > content.creationDate + expireAfter) {
                    foundExpired++;
                    service.log(`Removing expired content with ID '${content.id}'`);
                    service.store.content[contentIndex] = { deleted: true };
                }
            }
            if (foundExpired) {
                service.store.content = service.store.content.filter(i => !i?.deleted);
                service.saveStore();
            }
        } catch (err) {
            log(`Failed to check for expired content for service '${service.name}'! Error:`, err);
        }
    }
}
checkExpired();
if (config.expireCheckInterval) setInterval(checkExpired, config.expireCheckInterval);