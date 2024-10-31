const errors = {
    contentTypeNotAllowed: class {
        constructor(res, data) {
            return sendError(res, 400, 0, `Content-Type header is not allowed!`);
        }
    },
    idNotFound: class {
        constructor(res, data) {
            return sendError(res, 404, 0, `The ID '${data.params.id}' was not found`);
        }
    },
    missingLength: class {
        constructor(res, data) {
            return sendError(res, 411, 0, `Content-Length header is missing!`);
        }
    },
    missingType: class {
        constructor(res, data) {
            return sendError(res, 411, 0, `Content-Type header is missing!`);
        }
    },
    dataTooLarge: class {
        constructor(res, data) {
            return sendError(res, 413, 0, `Data too large!`);
        }
    },
    serverError: class {
        constructor(res, data) {
            return sendError(res, 500, 0, "Server error!");
        }
    }
};

const success = {
    created: class {
        constructor(res, data) {
            return sendSuccess(res, 200, `Created ${data.name} with ID '${data.id}'`, { id: data.id });
        }
    }
}

function sendError(res, status, code, error, extra) {
    const json = {
        code,
        error,
        success: false,
        ...extra
    }
    res.setStatus(status).json(json);
    return json;
}

function sendSuccess(res, status, message, extra) {
    const json = {
        message,
        success: true,
        ...extra
    }
    res.setStatus(status).json(json);
    return json;
}

module.exports = {
    errors,
    success,
    sendError,
    sendSuccess
};