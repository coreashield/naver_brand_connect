/**
 * Supabase 자동 설정 스크립트
 * 1. 프로젝트 생성 (Management API)
 * 2. 테이블 생성
 * 3. .env 업데이트
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..', '..');
const ENV_FILE = path.join(ROOT_DIR, '.env');

const SUPABASE_API = 'https://api.supabase.com/v1';

// 테이블 생성 SQL
const SCHEMA_SQL = `
-- Products 테이블
CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  store TEXT,
  price TEXT,
  original_price TEXT,
  commission TEXT,
  status TEXT DEFAULT 'ON',
  product_url TEXT,
  affiliate_link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workers 테이블 (각 VM/환경)
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  platform TEXT,
  status TEXT DEFAULT 'idle',
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Posts 테이블 (게시 기록)
CREATE TABLE IF NOT EXISTS posts (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT REFERENCES products(product_id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  posted_at TIMESTAMPTZ DEFAULT NOW()
);

-- Task Queue 테이블 (작업 큐)
CREATE TABLE IF NOT EXISTS task_queue (
  id BIGSERIAL PRIMARY KEY,
  product_id TEXT REFERENCES products(product_id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  assigned_worker UUID REFERENCES workers(id) ON DELETE SET NULL,
  priority INT DEFAULT 0,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);
CREATE INDEX IF NOT EXISTS idx_posts_product ON posts(product_id);
CREATE INDEX IF NOT EXISTS idx_posts_platform ON posts(platform);
CREATE INDEX IF NOT EXISTS idx_queue_status ON task_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_queue_worker ON task_queue(assigned_worker);

-- Updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Products 테이블에 트리거 적용
DROP TRIGGER IF EXISTS products_updated_at ON products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 게시 횟수 뷰 (자주 사용되는 쿼리 최적화)
CREATE OR REPLACE VIEW product_post_counts AS
SELECT
  p.product_id,
  p.name,
  p.affiliate_link,
  COUNT(CASE WHEN posts.platform = 'cafe' THEN 1 END) as cafe_count,
  COUNT(CASE WHEN posts.platform = 'blog' THEN 1 END) as blog_count,
  COUNT(*) as total_count
FROM products p
LEFT JOIN posts ON p.product_id = posts.product_id
GROUP BY p.product_id, p.name, p.affiliate_link;
`;

// readline 인터페이스
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

// Management API로 조직 목록 가져오기
async function getOrganizations(accessToken) {
  const res = await fetch(`${SUPABASE_API}/organizations`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Failed to get organizations: ${res.status}`);
  return res.json();
}

// Management API로 프로젝트 생성
async function createProject(accessToken, orgId, name, region = 'ap-northeast-2') {
  const dbPass = generatePassword();

  const res = await fetch(`${SUPABASE_API}/projects`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      organization_id: orgId,
      name: name,
      db_pass: dbPass,
      region: region,
      plan: 'free'
    })
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to create project: ${error}`);
  }

  return { ...(await res.json()), db_pass: dbPass };
}

// 프로젝트 상태 확인
async function waitForProject(accessToken, projectRef) {
  console.log('  프로젝트 초기화 대기 중...');

  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${SUPABASE_API}/projects/${projectRef}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (res.ok) {
      const project = await res.json();
      if (project.status === 'ACTIVE_HEALTHY') {
        return project;
      }
      process.stdout.write('.');
    }

    await new Promise(r => setTimeout(r, 5000));
  }

  throw new Error('Project initialization timeout');
}

// API 키 가져오기
async function getApiKeys(accessToken, projectRef) {
  const res = await fetch(`${SUPABASE_API}/projects/${projectRef}/api-keys`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!res.ok) throw new Error('Failed to get API keys');
  return res.json();
}

// SQL 실행
async function executeSQL(supabaseUrl, serviceKey, sql) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'apikey': serviceKey
    },
    body: JSON.stringify({ sql })
  });

  // RPC가 없으면 직접 REST API 사용 불가, pg 연결 필요
  // 대안: Supabase SQL Editor API 사용
  return res;
}

// 비밀번호 생성
function generatePassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  return Array.from({ length: 24 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// .env 파일 업데이트
function updateEnvFile(supabaseUrl, anonKey, serviceKey) {
  let envContent = '';

  if (fs.existsSync(ENV_FILE)) {
    envContent = fs.readFileSync(ENV_FILE, 'utf-8');

    // 기존 Supabase 설정 제거
    envContent = envContent
      .replace(/^SUPABASE_URL\s*=.*$/gm, '')
      .replace(/^SUPABASE_ANON_KEY\s*=.*$/gm, '')
      .replace(/^SUPABASE_SERVICE_KEY\s*=.*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  envContent += `\n\n# Supabase Configuration
SUPABASE_URL=${supabaseUrl}
SUPABASE_ANON_KEY=${anonKey}
SUPABASE_SERVICE_KEY=${serviceKey}
`;

  fs.writeFileSync(ENV_FILE, envContent.trim() + '\n', 'utf-8');
}

async function main() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   Supabase 자동 설정                           ║');
  console.log('║   프로젝트 생성 → 테이블 생성 → .env 업데이트  ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  try {
    // Access Token 안내
    console.log('📌 Supabase Access Token이 필요합니다.');
    console.log('   1. https://supabase.com/dashboard/account/tokens 접속');
    console.log('   2. "Generate new token" 클릭');
    console.log('   3. 토큰 복사\n');

    const accessToken = await question('Access Token 입력: ');

    if (!accessToken.trim()) {
      throw new Error('Access Token이 필요합니다.');
    }

    // 조직 목록 가져오기
    console.log('\n[1/5] 조직 정보 확인 중...');
    const orgs = await getOrganizations(accessToken.trim());

    if (orgs.length === 0) {
      throw new Error('조직이 없습니다. Supabase 대시보드에서 먼저 조직을 생성하세요.');
    }

    console.log(`  ✅ 조직 발견: ${orgs[0].name}`);
    const orgId = orgs[0].id;

    // 프로젝트 생성
    console.log('\n[2/5] 프로젝트 생성 중...');
    const projectName = `brand-connect-${Date.now().toString(36)}`;
    const project = await createProject(accessToken.trim(), orgId, projectName);
    console.log(`  ✅ 프로젝트 생성: ${project.name}`);
    console.log(`  📍 Region: ${project.region}`);
    console.log(`  🔗 Ref: ${project.id}`);

    // 프로젝트 활성화 대기
    console.log('\n[3/5] 프로젝트 초기화 대기 (1-2분 소요)...');
    await waitForProject(accessToken.trim(), project.id);
    console.log('\n  ✅ 프로젝트 활성화 완료');

    // API 키 가져오기
    console.log('\n[4/5] API 키 가져오기...');
    const apiKeys = await getApiKeys(accessToken.trim(), project.id);

    const anonKey = apiKeys.find(k => k.name === 'anon')?.api_key;
    const serviceKey = apiKeys.find(k => k.name === 'service_role')?.api_key;

    if (!anonKey || !serviceKey) {
      throw new Error('API 키를 찾을 수 없습니다.');
    }

    const supabaseUrl = `https://${project.id}.supabase.co`;
    console.log(`  ✅ URL: ${supabaseUrl}`);

    // .env 업데이트
    console.log('\n[5/5] .env 파일 업데이트...');
    updateEnvFile(supabaseUrl, anonKey, serviceKey);
    console.log('  ✅ .env 파일 업데이트 완료');

    // 스키마 SQL 저장 (수동 실행용)
    const schemaFile = path.join(ROOT_DIR, 'src', 'supabase', 'schema.sql');
    fs.writeFileSync(schemaFile, SCHEMA_SQL, 'utf-8');
    console.log(`  📁 스키마 파일 저장: ${schemaFile}`);

    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   설정 완료!                                   ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║ URL: ${supabaseUrl}`);
    console.log('╠════════════════════════════════════════════════╣');
    console.log('║ 다음 단계:                                     ║');
    console.log('║ 1. Supabase 대시보드 → SQL Editor 접속         ║');
    console.log('║ 2. src/supabase/schema.sql 내용 복사하여 실행  ║');
    console.log('║ 3. node src/supabase/migrate.js 실행           ║');
    console.log('╚════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n❌ 오류:', error.message);

    // 대안 제시
    console.log('\n📌 수동 설정 방법:');
    console.log('   1. https://supabase.com/dashboard 접속');
    console.log('   2. New Project 클릭');
    console.log('   3. 프로젝트 생성 후 Settings → API에서 URL과 키 복사');
    console.log('   4. .env 파일에 추가:');
    console.log('      SUPABASE_URL=https://xxx.supabase.co');
    console.log('      SUPABASE_ANON_KEY=eyJ...');
    console.log('      SUPABASE_SERVICE_KEY=eyJ...');
    console.log('   5. node src/supabase/init-tables.js 실행\n');

  } finally {
    rl.close();
  }
}

main();
