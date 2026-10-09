declare module '@tanstack/react-start/api' {
  export interface APIRouteHandlerContext {
    request: Request
    params?: Record<string, string>
  }

  export interface APIRouteHandlers {
    GET?: (ctx: APIRouteHandlerContext) => Promise<Response> | Response
    POST?: (ctx: APIRouteHandlerContext) => Promise<Response> | Response
    PUT?: (ctx: APIRouteHandlerContext) => Promise<Response> | Response
    DELETE?: (ctx: APIRouteHandlerContext) => Promise<Response> | Response
    PATCH?: (ctx: APIRouteHandlerContext) => Promise<Response> | Response
  }

  export function createAPIFileRoute(path: string): (handlers: APIRouteHandlers) => {
    path: string
    handlers: APIRouteHandlers
  }
}
