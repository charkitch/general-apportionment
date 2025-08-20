export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname;
    
    // Root redirect
    if (path === '/') {
      path = '/index.html';
    }
    
    // Try to get the asset from Cloudflare's asset server
    const asset = await env.ASSETS.fetch(request);
    
    // If asset found, add CORS headers and return
    if (asset.status === 200) {
      return new Response(asset.body, {
        headers: {
          ...asset.headers,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        }
      });
    }
    
    // 404 if not found
    return new Response('Not Found', { status: 404 });
  }
};