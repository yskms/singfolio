// 入口。エンドポイントは 7.3.3 以降で足す。今は、どのパスにも 404 を返すだけ。
export default {
  async fetch(): Promise<Response> {
    return new Response('Not Found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
} satisfies ExportedHandler<Env>;
