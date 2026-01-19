import 'dotenv/config';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 3334;

// Supabase 클라이언트 (서버 측)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// JSON 응답 헬퍼
function jsonResponse(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

// 요청 바디 파싱
async function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // HTML 페이지
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = readFileSync(join(__dirname, 'account_manager.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // API: 계정 목록 (status 필터 지원)
  if (url.pathname === '/api/accounts' && req.method === 'GET') {
    try {
      const statusFilter = url.searchParams.get('status'); // 'active', 'suspended', or null (all)

      let query = supabase
        .from('naver_accounts')
        .select('*');

      // status 필터 적용
      if (statusFilter && ['active', 'suspended'].includes(statusFilter)) {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query.order('id');

      if (error) throw error;
      jsonResponse(res, { success: true, data });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
    return;
  }

  // API: 계정 추가
  if (url.pathname === '/api/accounts' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { data, error } = await supabase
        .from('naver_accounts')
        .insert({
          naver_id: body.naver_id,
          naver_pw: body.naver_pw,
          blog_id: body.blog_id || body.naver_id,
          cafe_url: body.cafe_url || null,
          cafe_alias: body.cafe_alias || null,
          daily_cafe_limit: body.daily_cafe_limit ?? 150,
          daily_blog_limit: body.daily_blog_limit ?? 5,
          memo: body.memo || null
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          jsonResponse(res, { success: false, error: '이미 등록된 ID입니다' }, 400);
        } else {
          throw error;
        }
        return;
      }
      jsonResponse(res, { success: true, data });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
    return;
  }

  // API: 계정 삭제
  if (url.pathname.startsWith('/api/accounts/') && req.method === 'DELETE') {
    try {
      const id = url.pathname.split('/').pop();
      const { error } = await supabase
        .from('naver_accounts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
    return;
  }

  // API: 상태 변경
  if (url.pathname.startsWith('/api/accounts/') && url.pathname.endsWith('/status') && req.method === 'POST') {
    try {
      const parts = url.pathname.split('/');
      const id = parts[parts.length - 2];
      const body = await parseBody(req);

      const { error } = await supabase
        .from('naver_accounts')
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
    return;
  }

  // API: 게시 횟수 수정
  if (url.pathname.startsWith('/api/accounts/') && url.pathname.endsWith('/counts') && req.method === 'POST') {
    try {
      const parts = url.pathname.split('/');
      const id = parts[parts.length - 2];
      const body = await parseBody(req);

      const updateData = { updated_at: new Date().toISOString() };
      if (body.today_cafe_count !== undefined) {
        updateData.today_cafe_count = parseInt(body.today_cafe_count) || 0;
      }
      if (body.today_blog_count !== undefined) {
        updateData.today_blog_count = parseInt(body.today_blog_count) || 0;
      }
      if (body.daily_cafe_limit !== undefined) {
        const val = parseInt(body.daily_cafe_limit);
        updateData.daily_cafe_limit = isNaN(val) ? 150 : val;
      }
      if (body.daily_blog_limit !== undefined) {
        const val = parseInt(body.daily_blog_limit);
        updateData.daily_blog_limit = isNaN(val) ? 5 : val;
      }

      const { error } = await supabase
        .from('naver_accounts')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      jsonResponse(res, { success: true });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
    return;
  }

  // API: 계정 정보 수정 (PUT)
  if (url.pathname.startsWith('/api/accounts/') && !url.pathname.includes('/status') && !url.pathname.includes('/counts') && req.method === 'PUT') {
    try {
      const id = url.pathname.split('/').pop();
      const body = await parseBody(req);

      const updateData = { updated_at: new Date().toISOString() };
      if (body.naver_pw !== undefined) updateData.naver_pw = body.naver_pw;
      if (body.blog_id !== undefined) updateData.blog_id = body.blog_id;
      if (body.cafe_url !== undefined) updateData.cafe_url = body.cafe_url || null;
      if (body.cafe_alias !== undefined) updateData.cafe_alias = body.cafe_alias || null;
      if (body.daily_cafe_limit !== undefined) {
        const val = parseInt(body.daily_cafe_limit);
        updateData.daily_cafe_limit = isNaN(val) ? 150 : val;
      }
      if (body.daily_blog_limit !== undefined) {
        const val = parseInt(body.daily_blog_limit);
        updateData.daily_blog_limit = isNaN(val) ? 5 : val;
      }
      if (body.memo !== undefined) updateData.memo = body.memo || null;

      const { data, error } = await supabase
        .from('naver_accounts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      jsonResponse(res, { success: true, data });
    } catch (err) {
      jsonResponse(res, { success: false, error: err.message }, 500);
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 계정 관리 UI 실행 중!`);
  console.log(`\n   http://localhost:${PORT}\n`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅ 연결됨' : '❌ 설정 필요'}`);
  console.log(`   종료: Ctrl+C\n`);
});
