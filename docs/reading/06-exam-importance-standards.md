# 06 — 시험 중요도 기준 (Exam Importance Standards)

- **목적**: `passage_sentences.importance_level`(1~5)의 등급별 판정 기준과
  교사용 입력 가이드라인을 정의한다. 표시 라벨의 **진실 원천은 코드**
  (`src/utils/sentenceLearning.js`의 `IMPORTANCE_LABELS`)이며, 이 문서는
  그 라벨에 "어떤 문장을 몇 점으로 매길 것인가"의 판정 기준을 덧붙인
  것이다. 라벨 문구를 바꾸려면 코드와 이 문서를 함께 바꿔야 한다.
- **버전**: 1.0
- **작성일**: 2026-07-23

## 1. 시스템 사실관계 (실측)

- DB: `passage_sentences.importance_level int not null default 1`,
  `CHECK (1..5)` (`supabase_v3_4_sentence_learning.sql`). 즉 **입력하지
  않은 문장은 전부 1(참고)** 이다.
- 라벨(코드와 1:1 일치):

| 값 | 별 표기 | 라벨 (`IMPORTANCE_LABELS`) |
|---|---|---|
| 5 | ★★★★★ | 반드시 암기 |
| 4 | ★★★★ | 자주 출제 |
| 3 | ★★★ | 중요 |
| 2 | ★★ | 읽기 중심 |
| 1 | ★ | 참고 |

- `importance_level`은 채점/단계 전이 로직에 관여하지 않는다 — 표시·우선
  순위 안내용 메타다. 6단계 학습 진입 여부는 별개 필드
  `is_key_sentence`가 결정한다(§4).

## 2. 등급별 판정 기준

### ★★★★★ (5) — 반드시 암기

**판정 기준**: 다음 중 2개 이상에 해당.

- 해당 단원의 **핵심 문법 포인트를 대표하는 문장**(교과서가 그 문법을
  가르치려고 만든 문장).
- 내신 서술형(영작/배열/빈칸)으로 **그대로 출제되는 유형**의 문장.
- 단원 핵심 어휘·표현이 문법 포인트와 결합돼 있어, 이 문장 하나를
  외우면 어휘+문법이 동시에 복습되는 문장.

**예시 문장 유형**: 수동태 대표문(This bridge was built in 1990.),
가정법 대표문(If I were you, I would say sorry.), 현재완료 대표문,
관계대명사 대표문.

**교사 지침**: 지문당 1~3문장 이내로 제한. "다 중요하다"는 등급 체계를
무의미하게 만든다.

### ★★★★ (4) — 자주 출제

**판정 기준**: 다음 중 1개 이상.

- 핵심 문법의 **변형/응용 형태**(대표문은 5, 응용문은 4).
- 지문의 주제문(topic sentence)이나 결론 문장 — 내용 이해(주제/요지)
  문제의 근거가 되는 문장.
- 객관식 어법 문제의 선택지로 자주 변형되는 구조(어순, 수일치, 시제
  일치 등).

**예시 문장 유형**: 주제문, 핵심 문법이 들어간 두 번째·세 번째 예문,
간접의문문/비교 구문이 들어간 문장.

### ★★★ (3) — 중요

**판정 기준**:

- 단원 어휘가 2개 이상 들어 있어 어휘 복습 가치가 높은 문장.
- 부수적 문법 포인트(이번 단원의 주 타깃은 아니지만 시험 범위인 문법)가
  들어 있는 문장.
- 내용 흐름상 사건 전개의 핵심 문장(순서 배열 문제의 축).

**예시 문장 유형**: 이야기의 전환점 문장, 단원 어휘 다수 포함 문장.

### ★★ (2) — 읽기 중심

**판정 기준**:

- 시험에 직접 출제될 가능성은 낮지만 **지문 이해에 필요한** 연결 문장.
- 문법·어휘 부담 없이 유창하게 읽는 연습(끊어읽기/소리 내어 읽기)에
  적합한 문장.

**예시 문장 유형**: 배경 설명, 대화의 맞장구, 장면 묘사 문장.

### ★ (1) — 참고

**판정 기준**:

- 인사말, 감탄사, 아주 짧은 반응 문장 등 학습 부담을 줄 필요가 없는
  문장.
- 미분류 기본값 — 아직 검토하지 않은 문장도 1로 남는다(DB default).
  따라서 "1 = 검토 결과 참고 수준" and "1 = 미검토"가 구분되지 않는
  한계가 있다. 지문 입력을 마친 뒤 중요도 검토를 한 바퀴 돌리는 것을
  권장한다(§3-1).

**예시 문장 유형**: Hello, everyone. / Wow, look at that! / Thank you.

## 3. 교사용 입력 가이드라인

1. **입력 순서**: 지문 전체를 먼저 입력하고, 그다음 중요도를 일괄
   검토한다(한 문장씩 입력하며 매기면 지문 전체 대비 상대 판단이
   어렵다). 검토를 마친 지문은 1이 "검토된 참고"라는 의미를 갖게 된다.
2. **분포 권장**: 지문당 5는 1~3문장, 4는 2~4문장 수준을 권장. 5·4가
   절반을 넘으면 등급을 다시 검토한다(변별력 상실).
3. **시험 직전 활용**: 5 → 4 → 3 순서로 복습 우선순위를 안내한다.
   2·1은 읽기 유창성 연습용으로만.
4. **판정이 갈릴 때**: 낮은 쪽을 선택한다(과대평가보다 과소평가가
   안전 — 5가 흔해지는 것이 최악).
5. **학교 기출과 연동**: 실제 학교 기출에 출제된 문장을 확인하면 그
   문장은 4 이상으로 올리고, `grammar_point`에 출제 포인트를 표준 문구
   (`05-grammar-taxonomy.md`)로 기록한다.

## 4. `is_key_sentence`와의 관계

- `is_key_sentence`(boolean)만이 6단계 학습(read → chunk → puzzle →
  one_blank → ko_to_en → mastered) 진입을 결정한다. `importance_level`은
  진입을 결정하지 않는다 — 두 필드는 독립이다(시스템 사실).
- **권장 운영 관례** (강제 아님): 5·4 문장은 `is_key_sentence = true`로
  지정해 단계 학습을 걷게 하고, 3은 선택적으로, 2·1은 false(보기/듣기
  전용)로 둔다. 핵심 문장에는 청크(`03-chunking-guidelines.md`)도 함께
  입력해야 puzzle 단계가 의미 있게 동작한다(청크 미입력 시 단일 청크
  폴백).

## 5. 일관성 점검 쿼리 (참고용 — 읽기 전용)

운영자가 Supabase SQL Editor에서 분포를 점검할 때:

```sql
-- 지문별 중요도 분포(5·4 과다 여부 검토)
select p.title,
       count(*) filter (where s.importance_level = 5) as lv5,
       count(*) filter (where s.importance_level = 4) as lv4,
       count(*) filter (where s.importance_level = 3) as lv3,
       count(*) filter (where s.importance_level <= 2) as lv21,
       count(*) as total
from passages p
join passage_sentences s on s.passage_id = p.id
group by p.title
order by p.title;

-- 권장 관례 이탈 후보: 중요도 4 이상인데 핵심 문장이 아닌 문장
select p.title, s.position, s.english, s.importance_level
from passage_sentences s
join passages p on p.id = s.passage_id
where s.importance_level >= 4 and s.is_key_sentence = false
order by p.title, s.position;
```
