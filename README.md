<p align="center">
<img src="https://github.com/slanatech/swagger-stats/blob/master/screenshots/logo.png?raw=true" alt="swagger-stats"/>
</p>

# swagger-stats-ext

> fork from https://github.com/slanatech/swagger-stats

## More Features
### call init manually

```js
import * as swStats from 'swagger-stats-ext'
swStats.init(promConf)
```

### koa middleware, not use express-to-koa

```js
import * as swStats from 'swagger-stats-ext'
const app = new Koa()

app.use(swStats.koaMiddleware())
```

### report calls bewtween modules based on http protocol manually
add metric data for prometheus, "mcall_request_total" labeled
```
# HELP mcall_request_total The total number of all mcall based on http protocol requests
# TYPE mcall_request_total counter
mcall_request_total{service="user",method="GET",path="/info/get",http_status_code="400",code="0"} 1
```

```js
import * as swStats from 'swagger-stats-ext'
swStats.reportMCall('user', 'GET', '/info/get', 200, 0)
```

params for `reportMCall`

| **name**    | **optional**   |  **default** | **comments**          |
| ----------- | ---------- |  -------- | ----------------- |
|   service   |   N       |           | module name   |
|   method    |   N       |           | http method(GET/POST)   |
|   path      |   N       |           | http path   |
|   http_code |   N       |           | http status code   |
|   code      |   Y       |    0      | code returned by module   |

### more settings
```js
const promConf = {
  pm2: false, // use pm2 for node server
  pathProm: '/prometheus', // add route like: "ip:port/{pathProm}"，return prometheus metrics data
  // ...
} 
```