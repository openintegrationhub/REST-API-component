/* eslint-disable max-len,no-shadow,no-param-reassign,no-underscore-dangle,no-use-before-define,consistent-return,arrow-parens */

const { transform } = require("@openintegrationhub/ferryman");

const { newMessage } = require("./messages");

const axios = require("axios");

const {
  getRateLimitDelay,
  rateLimit,
  getRequestTimeout,
  encodeWWWFormParam,
} = require("./helpers");

const HTTP_ERROR_CODE_REBOUND = new Set([408, 423, 429, 500, 502, 503, 504]);

const methodsMap = {
  DELETE: "delete",
  GET: "get",
  PATCH: "patch",
  POST: "post",
  PUT: "put",
};

const bodyEncodings = {
  FORM_DATA: "form-data",
  RAW: "raw",
  URLENCODED: "urlencoded",
};

const bodyMultipartBoundary = "__X_ELASTICIO_BOUNDARY__";

const contentTypes = {
  FORM_DATA: "multipart/form-data",
  URLENCODED: "application/x-www-form-urlencoded",
  TEXT: "text/plain",
  APP_JSON: "application/json",
  APP_XML: "application/xml",
  TEXT_XML: "text/xml",
  HTML: "text/html",
};

const formattedFormDataHeader = `multipart/form-data; charset=utf8; boundary=${bodyMultipartBoundary}`;

const authTypes = {
  NO_AUTH: "No Auth",
  BASIC: "Basic Auth",
  API_KEY: "API Key Auth",
  OAUTH2: "OAuth2",
};

const CREDS_HEADER_TYPE = "CREDS_HEADER_TYPE";

/**
 * Executes the action's/trigger's logic by sending a request to the assigned URL and emitting response to the platform.
 * The function returns a Promise sending a request and resolving the response as platform message.
 *
 * @param {Object} msg incoming messages which is empty for triggers
 * @param {Object} cfg object to retrieve triggers configuration values, such as, for example, url and userId
 * @returns {Object} promise resolving a message to be emitted to the platform
 */
/* eslint-disable-next-line func-names */
module.exports.processMethod = async function (msg, cfg) {
  const emitter = this;

  emitter.logger.debug("Input message: %o", JSON.stringify(msg));
  emitter.logger.debug("Input configuration: %o", JSON.stringify(cfg));

  const config = cfg.reader;

  if (!config.url) {
    console("there is no url", config.url);
    throw new Error("URL is required");
  }
  console.log("this is the transformed url:", config.url);

  const { method, headers, token } = config;
  const body = config.body || {};
  const followRedirect = cfg.followRedirect !== "doNotFollowRedirects";
  const { auth } = cfg;
  const requestTimeout = getRequestTimeout(emitter.logger, cfg);
  // const token = cfg.token;

  if (!method) {
    throw new Error("Method is required");
  }

  const formattedMethod = methodsMap[method];

  if (!formattedMethod) {
    throw new Error(
      `Method "${method}" isn't one of the: ${Object.keys(methodsMap)}.`
    );
  }

  const rateLimitDelay = getRateLimitDelay(emitter.logger, cfg);

  /*
   if cfg.followRedirect has value doNotFollowRedirects
   or cfg.followRedirect is not exists
   followRedirect option should be true
   */
  const requestOptions = {
    method: formattedMethod,
    url: config.url,
    followRedirect,
    followAllRedirects: followRedirect,
    gzip: true,
    resolveWithFullResponse: true,
    simple: false,
    encoding: null,
    strictSSL: !cfg.noStrictSSL,
    timeout: requestTimeout,
    headers: {
      Authorization: "Bearer " + token,
    },
    body: body,
    data: body,
  };

  console.log("these are the requestOptions:", requestOptions);

  switch (auth.type) {
    case authTypes.BASIC:
      headers.push({
        key: "Authorization",
        // eslint-disable-next-line no-buffer-constructor
        value: `"Basic ${Buffer.from(
          `${auth.basic.username}:${auth.basic.password}`,
          "utf8"
        ).toString("base64")}"`,
      });

      break;

    case authTypes.API_KEY:
      headers.push({
        key: auth.apiKey.headerName,
        value: `"${auth.apiKey.headerValue}"`,
      });

      break;
    case authTypes.OAUTH2:
      emitter.logger.trace("auth = %j", auth);
      // eslint-disable-next-line no-case-declarations

      headers.push({
        key: "Authorization",
        value: `"Bearer ${token}"`,
      });
      break;
    default:
  }

  if (headers && headers.length) {
    requestOptions.headers = headers.reduce((headers, header) => {
      if (!header.key || !header.value) {
        return headers;
      }
      headers[header.key.toLowerCase()] = transform(
        msg,
        { expression: header.value },
        emitter
      );
      return headers;
    }, requestOptions.headers || {});
  }

  emitter.logger.debug("Request options: %o", JSON.stringify(requestOptions));

  return buildRequestBody()
    .then(() => {
      emitter.logger.trace("Request body: %o", requestOptions.body);
      console.log(requestOptions.body);
      return axios(requestOptions);
    })
    .then(async (result) => {
      console.log(result);
      console.log(result.data);
      emitter.logger.trace("Request output: %j", result);

      if (cfg.splitResult && Array.isArray(result)) {
        // Walk through chain of promises: https://stackoverflow.com/questions/30445543/execute-native-js-promise-in-series
        // eslint-disable-next-line no-restricted-syntax
        for (const item of result) {
          const output = newMessage(item);
          // eslint-disable-next-line no-await-in-loop
          await emitter.emit("data", output);
        }
      } else {
        const output = newMessage(result);
        await emitter.emit("data", output);
      }
      await rateLimit(emitter.logger, rateLimitDelay);
      await emitter.emit("end");
    })
    .catch(await buildErrorStructure);

  function checkOAuth2Keys(keys) {
    emitter.logger.trace("Check keys = %j", keys);
    if (!keys) {
      throw new Error("cfg.auth.oauth2.keys can not be empty");
    }
    if (!keys.access_token) {
      throw new Error("No access tokens were returned by the OAuth2 provider");
    }
    if (!keys.refresh_token) {
      throw new Error(
        "No refresh tokens were returned by the OAuth2 provider. Try to add access_type:offline as an additional parameter"
      );
    }
  }

  async function fetchNewToken() {
    emitter.logger.debug("Fetching new oauth2 token...");
    const { oauth2 } = auth;
    const authTokenResponse = await axios({
      url: oauth2.tokenUri,
      method: "POST",
      json: true,
      simple: false,
      resolveWithFullResponse: true,
      form: {
        refresh_token: oauth2.keys.refresh_token,
        grant_type: "refresh_token",
        client_id: oauth2.clientId,
        client_secret: oauth2.clientSecret,
        scope: oauth2.scopes ? oauth2.scopes.join(" ") : "",
      },
    });

    emitter.logger.trace("New token fetched : %j", authTokenResponse);

    if (authTokenResponse.statusCode >= 400) {
      throw new Error(
        `Error in authentication.  Status code: ${
          authTokenResponse.statusCode
        }, Body: ${JSON.stringify(authTokenResponse.body)}`
      );
    }

    return authTokenResponse.body;
  }

  function buildRequestBody() {
    if (formattedMethod !== methodsMap.GET) {
      const bodyEncoding =
        {
          [contentTypes.FORM_DATA]: bodyEncodings.FORM_DATA,
          [contentTypes.URLENCODED]: bodyEncodings.URLENCODED,
        }[body.contentType] || bodyEncodings.RAW;

      // eslint-disable-next-line default-case
      switch (bodyEncoding) {
        case bodyEncodings.FORM_DATA:
          // eslint-disable-next-line no-case-declarations
          const existingContentTypeHeader = headers.find(
            (header) => (
              // eslint-disable-next-line no-sequences
              header.key.match(/^content-type$/i),
              header.value === contentTypes.FORM_DATA
            )
          );

          if (existingContentTypeHeader) {
            existingContentTypeHeader.value = `"${formattedFormDataHeader}"`;
          } else {
            headers.push({
              key: "Content-Type",
              value: `"${formattedFormDataHeader}"`,
            });
          }

          emitter.logger.trace("formData: %o", body.formData);

          requestOptions.body = `--${bodyMultipartBoundary}`;

          return body.formData
            .reduce((p, x) => p.then(() => processItem(x)), Promise.resolve())
            .then(() => {
              requestOptions.body = `${requestOptions.body}--`;
              return requestOptions.body;
            });

        case bodyEncodings.RAW:
          if (!body.raw) {
            break;
          }

          requestOptions.body = transform(
            msg,
            { expression: body.raw },
            emitter
          );
          if (typeof requestOptions.body === "object") {
            requestOptions.body = JSON.stringify(requestOptions.body);
          }
          break;

        case bodyEncodings.URLENCODED:
          if (!body.urlencoded.length) {
            break;
          }

          // eslint-disable-next-line no-case-declarations
          const evaluatedUrlencoded = body.urlencoded
            .map((pair) => ({
              key: pair.key,
              value: transform(msg, { expression: pair.value }, emitter),
            }))
            .reduce((str, pair, index) => {
              const equation = `${encodeWWWFormParam(
                pair.key
              )}=${encodeWWWFormParam(pair.value)}`;

              return index === 0 ? equation : `${str}&${equation}`;
            }, null);

          requestOptions.body = evaluatedUrlencoded;
          break;
      }
      emitter.logger.trace("Request body: %o", requestOptions.body);
    }

    function processItem(item) {
      if (item.filename) {
        return axios(item.value)
          .then((result) => {
            requestOptions.body = `${requestOptions.body}\nContent-Disposition: form-data; name="${item.key}"; filename:"${item.filename}"\nContent-Type:${item["Content-Type"]}\n\n${result}\n--${bodyMultipartBoundary}`;
          })
          .catch((result) => {
            emitter.logger.trace(result);
          });
      }
      return Promise.resolve().then(() => {
        requestOptions.body =
          `${requestOptions.body}\nContent-Disposition: form-data; name="${item.key}"\n\n` +
          `${transform(
            msg,
            { expression: item.value },
            emitter
          )}\n--${bodyMultipartBoundary}`;
      });
    }

    return Promise.resolve(requestOptions.body);
  }

  async function buildErrorStructure(e) {
    if (
      cfg.enableRebound &&
      (HTTP_ERROR_CODE_REBOUND.has(e.code) ||
        e.message.includes("DNS lookup timeout"))
    ) {
      emitter.logger.info("Component error: %o", e);
      emitter.logger.info("Starting rebound");
      emitter.emit("rebound", e.message);
      emitter.emit("end");
    } else if (cfg.dontThrowErrorFlg) {
      const output = {
        errorCode: e.code,
        errorMessage: e.message,
        errorStack: e.stack,
      };
      emitter.logger.debug("Component output: %o", output);
      await emitter.emit("data", newMessage(output));
      await rateLimit(emitter.logger, rateLimitDelay);
      await emitter.emit("end");
    } else {
      emitter.logger.error("Component error: %o", e);
      if (e.message === "Error: ESOCKETTIMEDOUT") {
        e.message = `Timeout error! Waiting for response more than ${requestTimeout} ms`;
      }
      await emitter.emit("error", e);
      await rateLimit(emitter.logger, rateLimitDelay);
      await emitter.emit("end");
    }
  }
};
