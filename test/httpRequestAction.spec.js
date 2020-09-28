/* eslint-disable no-unused-vars,arrow-parens */

const { transform } = require("@openintegrationhub/ferryman");
const sinon = require("sinon");
const { expect } = require("chai");
const nock = require("nock");
const { messages } = require("../lib/messages");
const logger = require("@elastic.io/component-logger")();

const { stub } = sinon;

const processAction = require("../lib/actions/httpRequestAction").process;

describe("httpRequest action", () => {
  let emitter;
  let currentlyEmitting = false;
  beforeEach(() => {
    sinon.restore();
    currentlyEmitting = false;
    emitter = {
      emit: stub().returns(
        new Promise((resolve) => {
          // eslint-disable-next-line no-unused-expressions
          expect(currentlyEmitting).to.be.false;
          currentlyEmitting = true;
          setTimeout(() => {
            currentlyEmitting = false;
            resolve();
          }, 1);
        })
      ),
      logger,
    };
  });

  afterEach(() => {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  });

  describe("oauth2 credentials", () => {
    const msg = {
      body: {
        url: "http://example.com",
      },
    };
    const cfg = {
      reader: {
        url: "url",
        method: "POST",
        headers: [],
      },
      auth: {},
    };
    it("should fail if auth.oauth2.keys is missing", async () => {
      cfg.auth = {
        type: "OAuth2",
        oauth2: {},
      };
      try {
        await processAction.call(emitter, msg, cfg);
        throw new Error(
          "This line should never be called because await above should throw an error"
        );
      } catch (err) {
        expect(err.message).equal("cfg.auth.oauth2.keys can not be empty");
      }
    });

    it("should fail if auth.oauth2.keys.refresh_token is missing", async () => {
      cfg.auth = {
        type: "OAuth2",
        oauth2: {
          keys: {
            access_token: "token",
          },
        },
      };
      try {
        await processAction.call(emitter, msg, cfg);
        throw new Error(
          "This line should never be called because await above should throw an error"
        );
      } catch (err) {
        expect(err.message).equal(
          "No refresh tokens were returned by the OAuth2 provider. Try to add access_type:offline as an additional parameter"
        );
      }
    });

    it("should send request with oauth2 headers, with refreshed token", async () => {
      const refreshedToken = "refreshed_token";
      const tokenUri = "http://example.com/oauth/token/";

      cfg.auth = {
        type: "OAuth2",
        oauth2: {
          clientId: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          clientSecret: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          authUri: "http://example.com/oauth/auth",
          tokenUri,
          keys: {
            access_token: "token",
            token_type: "Bearer",
            refresh_token: "refresh_token",
            expires_in: 28800,
          },
        },
      };

      const responseMessage = {
        access_token: refreshedToken,
        token_type: "Bearer",
        refresh_token: "refresh_token",
        expires_in: 28800,
      };

      const refreshTokenNock = nock(tokenUri)
        .post("/", {
          refresh_token: cfg.auth.oauth2.keys.refresh_token,
          grant_type: "refresh_token",
          client_id: cfg.auth.oauth2.clientId,
          client_secret: cfg.auth.oauth2.clientSecret,
        })
        .reply((uri, requestBody) => [200, responseMessage]);

      const requestNock = nock(msg.body.url, {
        reqheaders: {
          Authorization: `Bearer ${refreshedToken}`,
        },
      })
        .intercept("/", "POST")
        .reply((uri, requestBody) => [200, { success: true }]);

      await processAction.call(emitter, msg, cfg);

      expect(refreshTokenNock.isDone());
      expect(requestNock.isDone());
    });

    it("should refresh token without `expires_in` parameter", async () => {
      const refreshedToken = "refreshed_token";
      const tokenUri = "http://example.com/oauth/token/";

      cfg.auth = {
        type: "OAuth2",
        oauth2: {
          clientId: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          clientSecret: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          authUri: "http://example.com/oauth/auth",
          tokenUri,
          keys: {
            access_token: "token",
            token_type: "Bearer",
            refresh_token: "refresh_token",
          },
        },
      };

      const responseMessage = {
        access_token: refreshedToken,
        token_type: "Bearer",
        refresh_token: "refresh_token",
      };

      const refreshTokenNock = nock(tokenUri)
        .post("/", {
          refresh_token: cfg.auth.oauth2.keys.refresh_token,
          grant_type: "refresh_token",
          client_id: cfg.auth.oauth2.clientId,
          client_secret: cfg.auth.oauth2.clientSecret,
        })
        .reply((uri, requestBody) => [200, responseMessage]);

      const requestNock = nock(msg.body.url, {
        reqheaders: {
          Authorization: `Bearer ${refreshedToken}`,
        },
      })
        .intercept("/", "POST")
        .reply((uri, requestBody) => [200, { success: true }]);

      await processAction.call(emitter, msg, cfg);

      expect(refreshTokenNock.isDone());
      expect(requestNock.isDone());
    });

    it("should send request with oauth2 headers, without refreshed token", async () => {
      cfg.auth = {
        type: "OAuth2",
        oauth2: {
          clientId: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          clientSecret: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          authUri: "http://example.com/oauth/auth",
          tokenUri: "http://example.com/oauth/token",
          keys: {
            access_token: "token",
            token_type: "Bearer",
            refresh_token: "refresh_token",
            expires_in: 28800,
            tokenExpiryTime: new Date().setDate(new Date().getDate() + 1),
          },
        },
      };

      const requestNock = nock(msg.body.url, {
        reqheaders: {
          Authorization: `Bearer ${cfg.auth.oauth2.keys.access_token}`,
        },
      })
        .intercept("/", "POST")
        .reply((uri, requestBody) => [200, { success: true }]);

      await processAction.call(emitter, msg, cfg);

      expect(requestNock.isDone());
    });

    it("should refresh token with non-expiring refresh_token", async () => {
      const refreshedToken = "refreshed_token";
      const tokenUri = "http://example.com/oauth/token/";

      cfg.auth = {
        type: "OAuth2",
        oauth2: {
          clientId: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          clientSecret: "e6b02a7d-eb7e-4090-b112-f78f68cd6022",
          authUri: "http://example.com/oauth/auth",
          tokenUri,
          keys: {
            access_token: "token",
            token_type: "Bearer",
            refresh_token: "refresh_token",
          },
        },
      };

      const responseMessage = {
        access_token: refreshedToken,
        token_type: "Bearer",
      };

      const refreshTokenNock = nock(tokenUri)
        .post("/", {
          refresh_token: cfg.auth.oauth2.keys.refresh_token,
          grant_type: "refresh_token",
          client_id: cfg.auth.oauth2.clientId,
          client_secret: cfg.auth.oauth2.clientSecret,
        })
        .reply((uri, requestBody) => [200, responseMessage]);

      const requestNock = nock(msg.body.url, {
        reqheaders: {
          Authorization: `Bearer ${refreshedToken}`,
        },
      })
        .intercept("/", "POST")
        .reply((uri, requestBody) => [200, { success: true }]);

      await processAction.call(emitter, msg, cfg);

      expect(refreshTokenNock.isDone());
      expect(requestNock.isDone());
    });
  });

  describe("split result", () => {
    it("should emit each item if splitResult=true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const msg = {
        body: {
          url: "http://example.com",
        },
        passthrough: { test: "test" },
      };
      const cfg = {
        splitResult: true,
        reader: {
          url: "url",
          method: "POST",
        },
        auth: {},
      };
      const responseMessage = ["first", "second", "third"];
      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", "POST")
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      // eslint-disable-next-line no-unused-expressions
      expect(messagesNewMessageWithBodyStub.calledThrice).to.be.true;
      expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql("first");
      expect(messagesNewMessageWithBodyStub.args[1][0]).to.be.eql("second");
      expect(messagesNewMessageWithBodyStub.args[2][0]).to.be.eql("third");
    });
    it("should emit array of item if splitResult=false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const msg = {
        body: {
          url: "http://example.com",
        },
      };
      const cfg = {
        splitResult: false,
        reader: {
          url: "url",
          method: "POST",
        },
        auth: {},
      };
      const responseMessage = ["first", "second", "third"];
      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .post("/")
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      // eslint-disable-next-line no-unused-expressions
      expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
      expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql({
        result: responseMessage,
      });
    });
    it("splitResult=true should be ignored if item is not array", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const msg = {
        body: {
          url: "http://example.com",
        },
      };
      const cfg = {
        splitResult: true,
        reader: {
          url: "url",
          method: "POST",
        },
        auth: {},
      };
      const responseMessage = { data: "not array" };
      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .post("/")
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      // eslint-disable-next-line no-unused-expressions
      expect(messagesNewMessageWithBodyStub.calledOnce).to.be.true;
      expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql(
        responseMessage
      );
    });
  });

  describe("when all params is correct", () => {
    ["GET", "POST", "PUT", "PATCH", "DELETE"].forEach((method, index) => {
      it(`should properly execute ${method} request`, async () => {
        const messagesNewMessageWithBodyStub = stub(
          messages,
          "newMessageWithBody"
        ).returns(Promise.resolve());
        const msg = {
          body: {
            url: "http://example.com",
          },
        };

        const cfg = {
          reader: {
            url: "url",
            method,
          },
          auth: {},
        };

        const responseMessage = { message: `hello world ${index}` };

        nock(transform(msg, { expression: cfg.reader.url }, emitter))
          .intercept("/", method)
          .delay(20 + Math.random() * 200)
          .reply((uri, requestBody) => [200, responseMessage]);

        await processAction.call(emitter, msg, cfg);
        expect(messagesNewMessageWithBodyStub.args[0][0]).to.eql(
          responseMessage
        );
      });
    });
    ["GET", "POST", "PUT", "PATCH", "DELETE"].forEach((method) => {
      it(`jsonata correctness ${method} test`, async () => {
        const msg = { body: {} };
        const cfg = {
          reader: {
            url:
              '"http://example.com/bar?foo=" & $moment(1519834345000).format()',
            method,
            headers: [
              {
                key: "SampleHeader",
                value: "$moment(1519834345000).format()",
              },
            ],
          },
          auth: {},
        };

        if (method !== "GET") {
          cfg.reader.body = {
            raw: "$moment(1519834345000).format()",
            encoding: "raw",
          };
        }

        // Due to different timezones of developers and production server
        // we can not hardcode expected evaluation result
        const sampleHeaderValue = transform(
          messages.newEmptyMessage(),
          { expression: "$moment(1519834345000).format()" },
          emitter
        );
        expect(sampleHeaderValue.includes("2018-02-28")).to.equal(true);

        nock("http://example.com", {
          reqheaders: {
            SampleHeader: sampleHeaderValue,
          },
        })
          .intercept(`/bar?foo=${sampleHeaderValue}`, method)
          .delay(20 + Math.random() * 200)
          .reply((uri, requestBody) => {
            if (method !== "GET") {
              expect(sampleHeaderValue.includes("2018-02-28")).to.equal(true);
            }
            return [200, "{}"];
          });

        await processAction.call(emitter, msg, cfg);
      });
    });
    it("should pass 1 header properly", (done) => {
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method: "POST",
          headers: [
            {
              key: "Content-Type",
              value: '"text/html; charset=UTF-8"',
            },
          ],
        },
        auth: {},
      };

      const responseMessage = "hello world";

      nock(transform(msg, { expression: cfg.reader.url }, emitter), {
        reqheaders: {
          "Content-Type": "text/html; charset=UTF-8",
        },
      })
        .intercept("/", "POST")
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => {
          done();
          return [200, responseMessage];
        });

      processAction.call(emitter, msg, cfg);
    });
    it("should pass multiple headers properly", (done) => {
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method: "POST",
          headers: [
            {
              key: "Accept",
              value:
                '"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"',
            },
            {
              key: "Keep-Alive",
              value: '"300"',
            },
            {
              key: "Connection",
              value: '"keep-alive"',
            },
          ],
        },
        auth: {},
      };

      const responseMessage = "hello world";

      nock(transform(msg, { expression: cfg.reader.url }, emitter), {
        reqheaders: {
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Connection: "keep-alive",
          "Keep-Alive": "300",
        },
      })
        .intercept("/", "POST")
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => {
          done();
          return [200, responseMessage];
        });

      processAction.call(emitter, msg, cfg);
    });
    describe("when request body is passed", () => {
      it("should properly pass raw body", (done) => {
        const msg = {
          body: {
            url: "http://example.com",
          },
        };

        const rawString =
          '"Lorem ipsum dolor sit amet, consectetur' +
          " adipiscing elit. Quisque accumsan dui id dolor " +
          'cursus, nec pharetra metus tincidunt"';

        const cfg = {
          reader: {
            url: "url",
            method: "POST",
            body: {
              raw: rawString,
              encoding: "raw",
            },
          },
          auth: {},
        };

        const responseMessage = "hello world";

        nock(transform(msg, { expression: cfg.reader.url }, emitter))
          .post("/", /Lorem\sipsum/gi)
          .delay(20 + Math.random() * 200)
          .reply((uri, requestBody) => {
            done();
            return [200, responseMessage];
          });

        processAction.call(emitter, msg, cfg);
      });
      it("should properly pass formdata body", (done) => {
        const msg = {
          body: {
            url: "http://example.com",
            world: "world",
          },
        };

        const cfg = {
          reader: {
            url: "url",
            method: "POST",
            body: {
              formData: [
                {
                  key: "foo",
                  value: '"bar"',
                },
                {
                  key: "baz",
                  value: '"qwe"',
                },
                {
                  key: "hello",
                  value: '"world"',
                },
              ],
              contentType: "multipart/form-data",
            },
            headers: [],
          },
          auth: {},
        };

        const responseMessage = "hello world";

        nock(transform(msg, { expression: cfg.reader.url }, emitter))
          .post("/", (body) =>
            body
              .replace(/[\n\r]/g, "")
              .match(/foo.+bar.+baz.+qwe.+hello.+world/)
          )
          .delay(20 + Math.random() * 200)
          .reply((uri, requestBody) => {
            done();
            return [200, responseMessage];
          });

        processAction.call(emitter, msg, cfg);
      });
    });
  });
  describe("connection error", () => {
    it("connection error && dontThrowErrorFlg false", async () => {
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: false,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .replyWithError("something awful happened");
      await processAction.call(emitter, msg, cfg).catch((e) => {
        expect(e.message).to.be.eql("Error: something awful happened");
      });
    });

    it("connection error && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: true,
        enableRebound: true,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .replyWithError("something awful happened");

      await processAction.call(emitter, msg, cfg).catch((e) => {
        expect(e.message).to.be.eql("Error: something awful happened");
        expect(emitter.emit.withArgs("rebound").callCount).to.be.equal(1);
      });
    });

    it("connection error && enableRebound true", async () => {
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        enableRebound: true,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply(408, "Error");

      await processAction.call(emitter, msg, cfg);
      expect(emitter.emit.withArgs("rebound").callCount).to.be.equal(1);
      expect(emitter.emit.withArgs("rebound").args[0][1]).to.be.equal(
        "Code: 408 Message: HTTP error Body: Error"
      );
    });
  });

  describe("when some args are wrong", () => {
    it("should throw error if cfg.reader.method is absent", async () => {
      const msg = {
        body: {
          url: "example.com",
        },
      };

      const cfg = {
        reader: {
          url: "url",
        },
        auth: {},
      };

      try {
        await processAction.call(emitter, msg, cfg);
      } catch (err) {
        expect(err.message).equal("Method is required");
      }
    });
    it("should throw error if cfg.reader.url is absent", async () => {
      const msg = {
        body: {
          url: "example.com",
        },
      };

      const cfg = {
        reader: {
          method: "GET",
        },
        auth: {},
      };

      try {
        await processAction.call(emitter, msg, cfg);
      } catch (err) {
        expect(err.message).equal("URL is required");
      }
    });
    it("should throw error if cfg.reader.method is wrong", async () => {
      const msg = {
        body: {
          url: "example.com",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method: "GETT",
        },
        auth: {},
      };

      try {
        await processAction.call(emitter, msg, cfg);
      } catch (err) {
        expect(err.message).equal(
          `Method "${cfg.reader.method}" isn't one of the: DELETE,GET,PATCH,POST,PUT.`
        );
      }
    });
  });

  describe("Non-JSON responses", () => {
    it("No response body && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: true,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage = "";

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply(204, responseMessage);

      await processAction.call(emitter, msg, cfg);

      // eslint-disable-next-line no-unused-expressions
      expect(messagesNewMessageWithBodyStub.args[0][0]).to.exist;
    });
    it("No response body && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: false,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage = "";

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply(204, responseMessage);

      await processAction.call(emitter, msg, cfg);

      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({});
    });
    it("Valid XML Response && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: true,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply(200, "<xml>foo</xml>", {
          "Content-Type": "application/xml",
        });

      await processAction.call(emitter, msg, cfg);

      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        headers: { "content-type": "application/xml" },
        body: { xml: "foo" },
        statusCode: 200,
        statusMessage: null,
      });
    });
    it("Valid XML Response && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: false,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply(200, "<xml>foo</xml>", {
          "Content-Type": "application/xml",
        });

      await processAction.call(emitter, msg, cfg);

      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        xml: "foo",
      });
    });
    it("Invalid XML Response", async () => {
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply(200, "<xml>foo</xmlasdf>", {
          "Content-Type": "application/xml",
        });

      try {
        await processAction.call(emitter, msg, cfg);
        throw new Error(
          "This line should never be called because await above should throw an error"
        );
      } catch (err) {
        // all good
      }
    });
  });

  describe("Some text response without any content type", () => {
    it("No response body", async () => {
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage = "boom!";

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);

      try {
        await processAction.call(emitter, msg, cfg);
        throw new Error(
          "This line should never be called because await above should throw an error"
        );
      } catch (err) {
        // all good
      }
    });
    it("JSON string without content-type  && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: true,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage =
        '{"id":"1", "name":"John", "surname":"Malkovich"}';

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.eql({
        headers: {},
        body: {
          id: "1",
          name: "John",
          surname: "Malkovich",
        },
        statusCode: 200,
        statusMessage: null,
      });
    });
    it("JSON string without content-type  && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: false,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage =
        '{"id":"1", "name":"John", "surname":"Malkovich"}';

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.eql({
        id: "1",
        name: "John",
        surname: "Malkovich",
      });
    });
    it("XML string without content-type   && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: false,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage = "<first>1</first><second>2</second>";

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.eql({
        result: responseMessage,
      });
    });
    it("XML string without content-type   && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com",
        },
      };

      const cfg = {
        dontThrowErrorFlg: true,
        reader: {
          url: "url",
          method,
        },
        auth: {},
      };

      const responseMessage = "<first>1</first><second>2</second>";

      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", method)
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        body: { result: responseMessage },
        headers: {},
        statusCode: 200,
        statusMessage: null,
      });
    });
  });

  describe("redirection", () => {
    it("redirect request true && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "GET";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "followRedirects",
        dontThrowErrorFlg: true,
        auth: {},
      };

      nock("http://example.com")
        .get("/YourAccount")
        .reply(302, '{"state":"before redirection"}', {
          Location: "http://example.com/Login",
        })
        .get("/Login")
        .reply(200, '{"state": "after redirection"}', {
          "Content-Type": "application/json",
        });

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        body: {
          state: "after redirection",
        },
        headers: {
          "content-type": "application/json",
        },
        statusCode: 200,
        statusMessage: null,
      });
    });
    it("redirect request true && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "GET";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "followRedirects",
        auth: {},
      };

      nock("http://example.com")
        .get("/YourAccount")
        .reply(302, '{"state":"before redirection"}', {
          Location: "http://example.com/Login",
        })
        .get("/Login")
        .reply(200, '{"state": "after redirection"}', {
          "Content-Type": "application/json",
        });

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        state: "after redirection",
      });
    });
    it("redirect request false && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "GET";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        dontThrowErrorFlg: true,
        followRedirect: "doNotFollowRedirects",
        auth: {},
      };

      nock("http://example.com")
        .get("/YourAccount")
        .reply(302, '{"state":"before redirection"}', {
          Location: "http://example.com/Login",
          "Content-Type": "application/json",
        })
        .get("/Login")
        .reply(200, '{"state": "after redirection"}', {
          "Content-Type": "application/json",
        });

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        headers: {
          location: "http://example.com/Login",
          "content-type": "application/json",
        },
        body: { state: "before redirection" },
        statusCode: 302,
        statusMessage: null,
      });
    });
    it("redirect request false && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "GET";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "doNotFollowRedirects",
        auth: {},
      };

      nock("http://example.com")
        .get("/YourAccount")
        .reply(302, '{"state":"before redirection"}', {
          Location: "http://example.com/Login",
          "Content-Type": "application/json",
        })
        .get("/Login")
        .reply(200, '{"state": "after redirection"}', {
          "Content-Type": "application/json",
        });

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        state: "before redirection",
      });
    });
    it("redirect request false POST && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "doNotFollowRedirects",
        auth: {},
      };

      nock("http://example.com")
        .post("/YourAccount")
        .reply(302, '{"state":"before redirection"}', {
          Location: "http://example.com/Login",
          "Content-Type": "application/json",
        })
        .get("/Login")
        .reply(200, '{"state": "after redirection"}', {
          "Content-Type": "application/json",
        });

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        state: "before redirection",
      });
    });
    it("redirect request false POST && dontThrowErrorFlg false", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const method = "POST";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "followRedirects",
        auth: {},
      };

      nock("http://example.com")
        .post("/YourAccount")
        .reply(302, '{"state":"before redirection"}', {
          Location: "http://example.com/Login",
          "Content-Type": "application/json",
        })
        .get("/Login")
        .reply(200, '{"state": "after redirection"}', {
          "Content-Type": "application/json",
        });

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.deep.equal({
        state: "after redirection",
      });
    });
  });
  describe("attachments", () => {
    it("action message with attachments", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const inputMsg = {
        body: {
          url: "http://qwre.com",
          world: "world",
        },
        attachments: {
          "1.csv": {
            "content-type": "text/csv",
            size: "45889",
            url:
              "http://insight.dev.schoolwires.com/HelpAssets/C2Assets/C2Files/C2ImportCalEventSample.csv",
          },

          "2.csv": {
            "content-type": "text/csv",
            size: "45889",
            url:
              "http://insight.dev.schoolwires.com/HelpAssets/C2Assets/C2Files/C2ImportCalEventSample.csv",
          },

          "3.csv": {
            "content-type": "text/csv",
            size: "45889",
            url:
              "http://insight.dev.schoolwires.com/HelpAssets/C2Assets/C2Files/C2ImportCalEventSample.csv",
          },
        },
      };

      const rawString =
        "Lorem ipsum dolor sit amet, consectetur" +
        " adipiscing elit. Quisque accumsan dui id dolor " +
        "cursus, nec pharetra metus tincidunt";

      const cfg = {
        reader: {
          url: "url",
          method: "POST",
          body: {
            formData: [
              {
                key: "foo",
                value: '"bar"',
              },
              {
                key: "baz",
                value: '"qwe"',
              },
              {
                key: "hello",
                value: '"world"',
              },
            ],
            contentType: "multipart/form-data",
          },
          headers: [],
        },
        auth: {},
      };

      nock("http://qwre.com")
        .post("/", (body) => {
          expect(body).to.contain("Start Date");
          return body
            .replace(/[\n\r]/g, "")
            .match(/foo.+bar.+baz.+qwe.+hello.+world/);
        })
        .delay(20 + Math.random() * 200)
        .reply((uri, requestBody) => [200, rawString]);
      await processAction.call(emitter, inputMsg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0]).to.eql({
        result: rawString,
      });
    });
  });

  describe("404 not found", () => {
    it("404 not found && dontThrowErrorFlg true", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      nock("http://example.com")
        .get("/YourAccount")
        .delay(20 + Math.random() * 200)
        .reply(404);
      const method = "GET";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "followRedirects",
        dontThrowErrorFlg: true,
        auth: {},
      };

      await processAction.call(emitter, msg, cfg);
      expect(messagesNewMessageWithBodyStub.lastCall.args[0].statusCode).to.eql(
        404
      );
      // TODO: should be 'Not Found' but nock doesn't allow statusMessage to be mocked https://github.com/nock/nock/issues/469
      expect(
        messagesNewMessageWithBodyStub.lastCall.args[0].statusMessage
      ).to.eql("HTTP error.");
    });
    it("404 not found && dontThrowErrorFlg false", async () => {
      nock("http://example.com")
        .get("/YourAccount")
        .delay(20 + Math.random() * 200)
        .reply(404);

      const method = "GET";
      const msg = {
        body: {
          url: "http://example.com/YourAccount",
        },
      };

      const cfg = {
        reader: {
          url: "url",
          method,
        },
        followRedirect: "followRedirects",
        dontThrowErrorFlg: false,
        auth: {},
      };

      await processAction.call(emitter, msg, cfg);
      expect(emitter.emit.callCount).to.equal(2);
      expect(emitter.emit.args[0][0]).to.equal("error");
      expect(emitter.emit.args[1][0]).to.equal("end");
    });
  });

  describe("delay between calls", () => {
    it("should wait delayBetweenCalls", async () => {
      const messagesNewMessageWithBodyStub = stub(
        messages,
        "newMessageWithBody"
      ).returns(Promise.resolve());
      const msg = {
        body: {
          url: "http://example.com",
        },
        passthrough: { test: "test" },
      };
      const cfg = {
        splitResult: true,
        reader: {
          url: "url",
          method: "POST",
        },
        auth: {},
        delay: "20",
        callCount: "4",
      };
      const responseMessage = ["first", "second", "third"];
      nock(transform(msg, { expression: cfg.reader.url }, emitter))
        .intercept("/", "POST")
        .reply((uri, requestBody) => [200, responseMessage]);
      await processAction.call(emitter, msg, cfg);
      // eslint-disable-next-line no-unused-expressions
      expect(messagesNewMessageWithBodyStub.calledThrice).to.be.true;
      expect(messagesNewMessageWithBodyStub.args[0][0]).to.be.eql("first");
      expect(messagesNewMessageWithBodyStub.args[1][0]).to.be.eql("second");
      expect(messagesNewMessageWithBodyStub.args[2][0]).to.be.eql("third");
    });
  });

  describe("timeout configuration", () => {
    it("should fail on small timeout", async () => {
      const msg = {
        body: {
          url: "https://httpstat.us/200?sleep=5000",
        },
        passthrough: { test: "test" },
      };
      const cfg = {
        splitResult: true,
        reader: {
          url: "url",
          method: "GET",
        },
        auth: {},
        requestTimeoutPeriod: "1000",
      };

      // Workaround for https://github.com/Readify/httpstatus/issues/79
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

      await processAction.call(emitter, msg, cfg);
      expect(emitter.emit.getCall(0).args[0]).to.be.equals("error");
      expect(emitter.emit.getCall(0).args[1].message).to.be.equals(
        `Timeout error! Waiting for response more than ${cfg.requestTimeoutPeriod} ms`
      );
    });
  });
});
