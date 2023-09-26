# HTTP/REST API Component

The **HTTP/REST API component** is a component that allows you to connect to any REST or HTTP API without programming your own components and deploying them into the platform.

The REST API component will perform a single HTTP call when executed. Incoming message data gets used to configure the API call made. The response from the API call will be the output message.

This document covers the following topics:

- Configuration Fields
- Defining Requests
- Authorization
- Paging APIs
- Different Data Types
- Configuration Examples

## Full List of Configuration Fields
The following is a complete list of configuration fields that are available on this component.

- **`attachmentServiceUrl`** - The url to use for connecting to the Attachment Storage Service.

- **`auth`** - If you are embedding authorization directly into the flow, instead of using the Secret Service, authorization coniguration goes here. See "Direct Authorization".

- **`callCount`** - The field should be used only in pair with `delay` and is used to further refine the delay between API calls. If not set, it defaults to `1`. Use call count with `delay` to define logic that says "execute x calls per y time in seconds".

- **`delay`** - If you want to slow down requests to your API you can set delay value (in seconds) and the component will delay calling the next request after the previous request.Time for the delay is calculated as `delay`/ `callCount` and shouldn't be more than 1140 seconds (19 minutes due to platform limitation). The `callCount` value by default is `1`. If you want to use another value, please set the `callCount` field. Notice: See [Known Limitations](#known-limitations) about `delay` value.

- **`dontThrowErrorFlg`** - If set to `true` return an HTTP error as the response and continue the flow. Otherwise throw error to stop the flow flow. Default is set to `false`.

- **`explicitArray`** - XML responses are automatically parsed into JSON. When `explicitArray` is set to `true`, child nodes will always be put in an array. When `false` (the default), child nodes will only be put in an array if there is more than one child node.

- **`followRedirect`** - By default the `followRedirect` option is set to to the value `followRedirects` and will allow your API request to follow redirects on the server for up to 5 redirects. If you want disable Follow Redirect functionality, you can set the `followRedirect` option to `doNotFollowRedirects`.

- **`httpReboundErrorCodes`** - Array of error status codes from the API response object which will cause the request to be put in the rebound queue.  Messages in the rebound queue will be retried at a progressively longer interval (15 sec, 30 sec, 1 min, 2 min, 4 min, 8 min, etc.). Setting this value will override default values [408, 423, 429, 500, 502, 503, 504]. You should include those status codes unless you have a reason not to.

- **`jsonataResponseValidator`** - This works in coordination with the `enableRebound` configuration to throw a status code 429. When this JSONata configuration is present and `enableRebound` set to `true`, it is assumed the JSONata will resolve to a boolean. If the boolean is false the incoming component message will be requeued and tried again. Otherwise the response will be processed as it normally would.

- **`noStrictSSL`** - If set to `true`, disables verifying the server certificate. This is not recommended for most uses. The default is set to `false`.

- **`reader`** - All configuration about the API request is configured here.

- **`requestTimeoutPeriod`** - Timeout period in milliseconds (1-1140000) while component waiting for server response, This would overwrite the REQUEST_TIMEOUT environment variable if configuration field is provided. Defaults to 100000 (100 sec).

- **`Snapshot in URL tranform`** - If a snapshot value is available it is added into the msg.data object as `msg.data.oihsnapshot`. This can be used in conjuction with the `responseToSnapshotTransform` to perform paging. You can save information for the next page from the response in the snapshot and then use the snapshot information in the next request URL. **TODO**: Is this option even used anywhere?

- **`saveReceivedData`** - If set to `true`, component's output message will include the request data passed into the REST component and the response data. If not set or set to `false` the component's output message will only include the response data.

- **`splitResult`** - If set to `true` and the API response is an array, seperate messages will be created for each item of array. Otherwise one message with the entire array will be emitted. Default is set to `false`.

## Request
The following options are used to set up the HTTP request. They all live under a configuration field called `reader`:

- **`url`** - A JSONata expression that executes against the message passed into the component to define the URL for the HTTP request. Hint: To hardcode a static URL, simply wrap it in single quotes to make it a basic JSONata expression.

- **`method`** - The HTTP method to be executed. `GET`, `PUT`, `POST`, `DELETE` and `PATCH` are supported.

- **`body`** - A JSONata expression that executes against the message passed into the component to define the request body for any HTTP request that doesn't use the method `GET`. Hint: To just accept the message passed in as the message data, without making any transformation, simply use `$$` to make it a basic JSONata expression that references the root of the message. Unlike older versions of this component, this JSONata executes relative to `msg` not `msg.data` or `msg.body`.

- **`enableRebound`** - Enabling rebound will retry any request that receives the following response codes. It accepts `true` or `false`. Default is set to `false`.
  - 408: Request Timeout
  - 423: Locked
  - 429: Too Many Requests
  - 500: Internal Server Error
  - 502: Bad Gateway
  - 503: Service Unavailable
  - 504: Gateway Timeout
  - DNS lookup timeout

- **`headers`** - An array of objects with `key` and `value` as the only properties on each. `key` is used to store the header name and `value` its value.
  
- **`lastPageValidator`** - JSONata applied to the response which evaluates to a boolean. This JSONata determines whether there is a nextPage or stop iterating pages.

- **`pagingEnabled`** - If set to `true` the field `responseToSnapshotTransform` can be used to transform a response into a "next page" request.
  
- **`responseToSnapshotTransform`** - This is a JSONata applied to the REST response body and stored in the snapshot as an object. This is used in conjunction with `pagingEnabled` to define the request to get the "next page" from a response. Note: JSONata expression will run relative to the API call response, not the flow execution message.

## Authorization

To use the REST API component with any restricted access API provide the authorization credentials directly into the component or use the secret service to inject them into the request at runtime.

The REST API component supports 4 authorization types:

- **`No Auth`** - Use this method to work with any open REST API
- **`Basic Auth`** - Use it to provide login credentials like username/password
- **`API Key Auth`** - Use it to provide `API Key` to access the resource
- **`OAuth2`** - Use it to provide `Oauth2` credentials to access the resource. Currently it is implemented `Authorization code` OAuth2 flow.


### Direct Authorization
You can add the authorization method directly into the flow steps using the REST API component. Authorization configuration is placed under a field called `auth`. The following fields are available under `auth`:

- **`type`** - Must be one of `No Auth`, `Basic Auth`, or `API Key Auth`.
- **`basic`** - `basic.username` and `basic.password` are where to store the credentials for performing basic authorization. Only use these if `type` is `Basic Auth`.
- **`apiKey`** - `apiKey.headername` defines an authorization header name and `apiKey.headerValue` defines the API key value. Only use if `type` is `API Key Auth`. Note: to define a bearer token, you can set `apiKey.headerValue` to `Bearer XXXXXXX`.

### Secret Service Integration for Authorization

To securely retrieve credentials from the secret service ferryman will inject a secret object by specifying the `credential_id` at the top level of a component configuration in a flow.  The `credential_id` should be a secret service secret ID.

The secret service can currently support these secret types:
- **SIMPLE** - Constains a `username` and `passphrase` and will be used for `Basic Auth`
- **MIXED** - The `payload` of this type is a stringified JSON object. The `payload` string is parsed into an object before being added to the component config object. Because of the flexible nature of this type a JSONata transformation config is provided `secretAuthTransform`. The output of this transformation will replace the `config.auth` configuration.  The `secretAuthTransform` will work for tranforming the data for other types but isn't necessary since the other secret types have well-defined structure.
- **API_KEY** - Contains a `key` and `headerName` and will be used for `API Key Auth`
- **OA1_TWO_LEGGED** - Contains `expiresAt`
- **OA1_THREE_LEGGED** - Contains `accessToken` which will be sent as a Bearer Token in the request header
- **OA2_AUTHORIZATION_CODE** - Contains `accessToken` which will be sent as a Bearer Token in the request header
- **SESSION_AUTH** - Contains `accessToken` which will be sent as a Bearer Token in the request header

## Paging

The component has the ability to loop through pages in one run of the trigger or handle only one page per trigger.  If only doing one page of data per trigger you will even out the amount of data over time. You request whatever the page size at each trigger. If looping through all of the pages in one trigger, you will have uneven payload sizes sent through the flow but can expect to get all of the data sooner.

The options for configuring one page per trigger are part of the general configurations above. To trigger the component once, but iterate through multiple pages of results, you must configure the following:

- `pagingEnabled` must be set to true.

- `responseToSnapshotTransform` - This allows you to extract and build nextPage information for the next iterations url JSONata. See the paging unit tests for an example.

- `lastPageValidator` - JSONata applied to the response which evaluates to a boolean. This JSONata determines whether there is a nextPage or stop iterating pages.

Paging is often implemented on scheduled flows, executed by the Scheduler Service.

## Data Types

For any requests that are not using the `GET` method, the following describes how to use the REST component to execute requests of different data types used in the body.

### JSON

Set a `header` with a key set to `Content-Type` and a value set to to `application/json`. Use the `body` field to execute JSONata on the input message to define the contents for the body. Data is passed through through flows as JSON by default, so no further transformation is required.

### XML
Set a `header` with a key set to `Content-Type` and a value set to to `application/xml`. Use the `body` field to execute JSONata that references an XML string stored in the input message. The data should be transformed into an XML string prior to being passed to the REST API component.

### GraphQL Query or Mutation
Set a `header` with a key set to `Content-Type` and a value set to to `application/json`. Use the `body` field to execute JSONata on the input message to define the structure of the GraphQL query or mutation. Data is passed through through flows as JSON by default, so no further transformation is required.

## Configuration Examples
The following are some simple examples to help describe the ways you can configure the REST API Component.

### Basic GET Request
This example shows the following:

- Making a GET reqiest
- Use of the integration with the secret service to include a credential
- Using JSONata to embed an ID from the incoming message in the request URL

```
{
  "id": "rest-example",
  "componentId": "XXXXX",
  "name": "Rest Component Example",
  "function": "httpRequestAction",
  "credentials_id": "XXXXX",
  "fields": {
    "reader": {
      "url": "'https://someserver.com/api/thing/' & $$.data.id",
      "method": "GET",
      "headers": [
        {
          "key": "Content-Type",
          "value": "'application/json'"
        }
      ]
    }
  }
}
```

### Basic POST Request
This example shows the following:

- Making a POST request
- Referencing an object deeper inside the message
- Credentials hardcoded into the configuration

```
{
  "id": "rest-example",
  "componentId": "XXXXX",
  "name": "REST Example",
  "function": "httpRequestAction",
  "fields": {
    "reader": {
      "url": "'https://someserver.com/api/thing/'",
      "method": "POST",
      "headers": [
        {
          "key": "Content-Type",
          "value": "'application/json'"
        }
      ],
      "body": {
        "raw": "$$.data.objects.thing"
      }
    },
    "auth": {
      "type": "Basic Auth",
      "basic": {
        "username": "apiuser",
        "password": "password"
      }
    }
  }
}
```

###Override Default Error Behavior
This example shows the following:

- Enabling rebound to occur on certain errors (`enableRebound`)
- Configuring specific error codes to concern (`httpReboundErrorCodes`)
- Bypassing the default REST component behavior to stop and emit and error when an error status code is received (`dontThrowErrorFlg`)
- Send both the error response (`dontThrowErrorFlg`) and the input message (`saveReceivedData`) when emitting a message to the next step

```
{
  "id": "rest-example",
  "componentId": "XXXXX",
  "name": "REST Example",
  "function": "httpRequestAction",
  "credentials_id": "XXXXX",
  "fields": {
    "reader": {
      "url": "'https://someserver.com/api/thing/' & $$.data.id",
      "method": "GET",
      "headers": [
        {
          "key": "Content-Type",
          "value": "'application/json'"
        }
      ]
    },
    "dontThrowErrorFlg": true,
    "saveReceivedData": true,
    "enableRebound": true,
    "httpReboundErrorCodes": [
      408,
      404,
      423,
      429,
      500,
      502,
      503,
      504
    ]
  }
}
```

### Paging a REST API
This example shows the following:

- Enabling paging on the REST API component (`pagingEnabled`)
- Defining when the last page has been processed (`lastPageValidator`)
- Defining how to define a request for the "next" page (`responseToSnapshotTransform`)

Note: The JSONata expressions defined in this example are for example purposes and aren't necessarilly going to work on any specific API.

```
{
  "id": "get-updated-customers",
  "componentId": "60f0fdf26694b2001cffe457",
  "name": "Get Updated Customers",
  "function": "httpRequestAction",
  "credentials_id": "611691e013bf51001334a94d",
  "fields": {
    "reader": {
      "url": "'https://someserver.com/api/thing/'",
      "method": "GET",
      "headers": [
        {
          "key": "Content-Type",
          "value": "'application/json'"
        }
      ],
      "pagingEnabled": true,
      "lastPageValidator": "$$.pagesRemaining < 1",
      "responseToSnapshotTransform": "{'nextPage': offset < total_count ? offset + 100 : ()}"
    }
  }
}
```

### Attachment Storage Service Interaction

The url for the Attachment Storage Service can be supplied, in descending order of precedence:

- specifying a `attachmentServiceUrl` value in the node's fields object
- environment variable `ELASTICIO_ATTACHMENT_STORAGE_SERVICE_BASE_URL`
- default value of `http://attachment-storage-service.oih-prod-ns.svc.cluster.local:3002`
