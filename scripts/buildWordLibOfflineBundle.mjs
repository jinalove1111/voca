// src/utils/wordLibrary.js를 **네트워크 0**으로 돌리기 위한 번들러.
// supabaseClient를 scripts/fakeSupabaseModule.mjs로 갈아끼운다.
//
// 기존 buildWordLibBundle.mjs와의 차이: 그쪽은 .env의 실제 Supabase URL/키를
// 주입해 라이브 접속이 가능한 번들을 만든다(순수 함수만 쓰는 테스트가
// import.meta.env 때문에 쓰는 용도). 이 번들은 반대로 **접속 자체를 불가능
// 하게** 만들어, refreshWordLibrary() 같은 조회 경로를 결정적으로 검증한다.
//
// external:true가 핵심 — buildRaceBundle.mjs 주석과 같은 이유다. external을
// 빼면 esbuild가 스텁 소스를 번들 안으로 인라인해서, 테스트가 직접 import한
// 스텁 인스턴스와 번들 안 사본이 분리된다(주입한 데이터셋이 안 보인다).
import esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const fakeSupabase = path.resolve('scripts/fakeSupabaseModule.mjs')

await esbuild.build({
  entryPoints: ['src/utils/wordLibrary.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'scripts/.tmp/wordLibrary.offline.bundle.mjs',
  // 스텁이 supabase를 완전히 대체하므로 실제 값은 쓰이지 않는다. 다만
  // 번들 안 다른 모듈이 import.meta.env를 참조할 수 있어 정의는 남긴다.
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://offline.invalid'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('offline-test-key'),
  },
  plugins: [{
    name: 'offline-supabase',
    setup(build) {
      build.onResolve({ filter: /supabaseClient(\.js)?$/ }, () => ({
        path: pathToFileURL(fakeSupabase).href,
        external: true,
      }))
    },
  }],
})
console.log('bundled -> scripts/.tmp/wordLibrary.offline.bundle.mjs')
