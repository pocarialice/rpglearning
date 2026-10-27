// HTTP API 2.0 のイベント（JWTクレームつき）
export function httpEvent({ method = 'GET', path, body, query, groups = ['learner'], sub = 'sub-15', auth = true } = {}) {
  const ev = {
    version: '2.0', rawPath: path, rawQueryString: '',
    requestContext: { http: { method, path }, requestId: 'req-1' },
    queryStringParameters: query
  }
  if (body !== undefined) ev.body = typeof body === 'string' ? body : JSON.stringify(body)
  if (auth) ev.requestContext.authorizer = { jwt: { claims: { sub, groups } } }
  return ev
}
export const parse = (res) => JSON.parse(res.body)
