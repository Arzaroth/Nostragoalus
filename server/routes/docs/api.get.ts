// API reference UI (Scalar) over the filtered spec, with httpie among the
// snippet clients and as the default.
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  const configuration = {
    url: '/docs/openapi.json',
    defaultHttpClient: { targetKey: 'shell', clientKey: 'httpie' },
    metaData: { title: 'Nostragoalus API' },
  }
  return `<!doctype html>
<html>
<head>
  <title>Nostragoalus API</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="/favicon.svg">
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>Scalar.createApiReference('#app', ${JSON.stringify(configuration)})</script>
</body>
</html>`
})
