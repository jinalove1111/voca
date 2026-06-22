# Paul Easy Voca (폴이지보카) - 프로젝트 계획서

## 프로젝트 목적
폴이지보카는 영어 공부방 학생들이 매일 단어를 학습하고, 발음 듣기, 녹음 후 따라 말하기를 통해 발음 실력을 향상시키며, 학습 기록과 숙제 완료 상태를 관리할 수 있는 앱입니다.

## 현재 구현된 기능
- 학생 이름 입력 후 학습 시작
- 단어 학습 화면
- 단어 검색 및 선택
- 퀴즈와 레벨업 미션 기본 흐름
- 로컬스토리지 기반 사용자 데이터 저장
- GitHub 저장소 연결
- Vercel 배포 완료
- 모바일 오디오/녹음 문제 수정 작업 진행 중

## 앞으로 필요한 기능
- 반별 다른 단어 제공
- 날짜별 단어 제공
- 반별/날짜별 숙제 관리
- 관리자 단어 업로드 기능
- 학습 기록 저장 및 조회
- 학부모 모니터링 화면
- AI 문장 검사 기능
- 모바일 오디오/녹음 안정화

## 사용자 역할
### 학생
- 본인 이름으로 로그인
- 반별 단어 학습
- 단어 발음 듣기
- 녹음하고 따라 말하기
- 퀴즈/미션 수행
- 숙제 완료 상태 확인

### 관리자(원장)
- 반별 단어 업로드 및 수정
- 학생-반 매핑 관리
- 숙제 및 학습 기록 확인
- 반/날짜별 학습 스케줄 관리

### 학부모
- 학생의 학습 진도 확인
- 숙제 완료 여부 확인
- 발음/퀴즈 기록 조회

## MVP 1단계
- 학생 이름 입력 기능 유지
- 반 선택 기능 추가
- 고정 반 목록 제공: 월수금초급, 화목초급, 중등내신
- studentName과 className을 localStorage에 저장
- 반별로 다른 테스트 단어 5개씩 보여주기
- DB 연결 및 관리자 업로드, AI 문장검사 제외
- 기존 학습 기능 최대한 유지
- 모바일 Android Chrome에서 소리 및 녹음 정상 동작 확인

## 단계별 개발 로드맵
### 1단계: 반별 단어 기반 MVP
- 반 선택 기능 추가
- 반별 단어 5개 고정 제공
- 학생-반 매핑 저장
- 클래스 기반 단어 로딩
- 모바일 오디오/녹음 안정화

### 2단계: 날짜별 단어 및 숙제 관리
- 날짜별 단어 배정 기능
- 오늘의 단어/숙제 화면
- 숙제 완료 기록 저장
- 학생별 학습 리포트

### 3단계: 관리자/학부모 기능 확장
- 관리자 반 관리 화면 개선
- 학부모 대시보드 추가
- 반/학생 통계 제공
- 예외 처리 및 UX 고도화

### 4단계: AI 기능 도입
- AI 문장 검사 설계 및 적용
- 녹음 기반 발음 피드백
- 숙제 자동 평가 및 추천
- AI 학습 콘텐츠 생성

## 반별 단어 시스템 설계
- 고정 반 목록: 월수금초급, 화목초급, 중등내신
- 각 반별 단어 5개를 기본 데이터로 제공
- 학생이 반을 선택하면 해당 반 단어만 로드
- `localStorage`에 `studentName`과 `className`을 저장
- 반별 단어는 `wordLibrary`에서 반 이름으로 분기
- 관리자 업로드는 다음 단계로 연기

## 날짜별 단어 시스템 설계
- 각 날짜에 보여줄 단어 리스트를 저장하는 구조 설계
- `dailyWords` 또는 `schedule` 스키마에 날짜별 단어 매핑
- FAST MVP에서는 고정 날짜별 단어 대신 반별 단어 우선 적용
- 추후 `today` 기준 단어 필터링으로 확장

## 관리자 단어 업로드 계획
- 초기에는 Excel/PDF 업로드 UI로 반별 단어 저장
- 관리자 전용 화면에서 반 생성 및 단어 등록
- 업로드 파일 없이 수동 입력도 지원
- 다음 단계에서 AI 문장 검사와 연계 가능

## DB 구조 초안
### Students
- id
- name
- classId
- createdAt
- updatedAt

### Classes
- id
- name
- createdAt
- updatedAt

### Words
- id
- word
- meaning
- pronunciation
- level
- memoryTip
- examples
- createdAt
- updatedAt

### ClassWords
- id
- classId
- wordId
- dateAssigned

### LearningRecords
- id
- studentId
- wordId
- viewedAt
- listenedAt
- pronunciationAttempts
- pronunciationSuccess
- quizAttempts
- quizCorrect
- date

### HomeworkRecords
- id
- studentId
- classId
- date
- status
- submittedAt
- notes

## 학습 기록 저장 계획
- 현재는 로컬스토리지 기반 저장 유지
- 학생별 `cleared`, `missions`, `daily` 데이터 저장
- 추후 DB 전환 시 `LearningRecords` 테이블로 이전
- 모바일 세션 단위 기록도 로컬에 임시 저장 가능

## 모바일 오디오/녹음 체크리스트
- Android Chrome에서 `speechSynthesis` 동작 확인
- `AudioContext` unlock 로직 적용
- `getUserMedia` 권한 요청 및 예외 처리
- `MediaRecorder` 지원 여부 안전 처리
- 소리 재생/녹음 시작 버튼은 사용자 제스처로 실행
- 권한 거부 시 안내 메시지 제공

## Vercel 배포 방식
- GitHub `main` 브랜치 푸시 시 Vercel 자동 배포
- `package.json` 빌드 스크립트 `vite build` 사용
- 배포 전 `npm run build` 통과 여부 확인
- `index.html`과 `src`가 정적 사이트로 배포되도록 구성

## 구현 예정 상태
- 현재 구현: 학생 이름 입력, 단어 학습, GitHub/Vercel 배포
- 추가 구현: 반 선택, 반별 단어 로딩, className 저장
- 보류: DB, 관리자 업로드, AI 문장 검사
