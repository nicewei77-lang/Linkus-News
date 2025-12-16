# Linkus News - 카카오 챗봇 스킬

링커스 카페와 인스타그램의 최신 소식을 가져오는 카카오 챗봇 스킬 서버입니다.

## 기능

- 네이버 카페 최신 글 3개 가져오기 (HTML 파싱)
- 인스타그램 최신 게시물 3개 가져오기 (RSS 피드)

## 설치

```bash
npm install
```

## 환경변수 설정

`.env` 파일을 생성하고 다음 내용을 입력하세요:

```bash
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
INSTAGRAM_RSS_URL=your_instagram_rss_feed_url
PORT=3000
```

### Instagram RSS 피드 생성 방법

1. [RSS.app](https://rss.app/) 접속
2. "Create RSS Feed" 클릭
3. "Instagram" 선택
4. 사용자 이름 입력: `linkus_official_`
5. RSS 피드 URL 생성 후 복사
6. `.env` 파일의 `INSTAGRAM_RSS_URL`에 붙여넣기

환경변수가 없어도 네이버 카페 기능은 코드에 기본값이 포함되어 있어 바로 실행 가능합니다.

## 실행

```bash
npm start
```

## API 엔드포인트

### POST /linkus-news

카카오 챗봇 스킬 엔드포인트입니다.

**요청 예시:**
```json
{
  "version": "2.0",
  "userRequest": {
    "callbackUrl": "https://kakao-i..."
  }
}
```

**응답 형식:**
```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      {
        "simpleText": {
          "text": "📌 링커스 카페 최신 글\n\n1. 제목...\n..."
        }
      }
    ]
  }
}
```

## 배포 (Render)

1. GitHub 저장소에 푸시
2. Render에서 새 Web Service 생성
3. GitHub 저장소 연결
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Environment Variables 설정:
   - `NAVER_CLIENT_ID` (코드에 기본값 포함)
   - `NAVER_CLIENT_SECRET` (코드에 기본값 포함)
   - `INSTAGRAM_RSS_URL` (필수: RSS.app에서 생성한 RSS 피드 URL)
   - `PORT` (선택사항, 기본값: 3000)
7. Deploy

## 카카오 스킬 연동

Render 배포 후 생성된 URL을 사용:

```
https://your-app.onrender.com/linkus-news
```

카카오 i 오픈빌더에서 스킬 URL로 위 주소를 입력하세요.

## 개발 참고사항

- **네이버 카페**: HTML 파싱 방식으로 최신 글 목록 페이지에서 직접 추출
  - URL: `https://cafe.naver.com/linkus16/ArticleList.nhn`
  - EUC-KR 인코딩 처리 (iconv-lite)
  - cheerio로 HTML 파싱
  - 실패 시 네이버 검색 API로 폴백
  
- **인스타그램**: RSS 피드 방식
  - RSS.app 등의 서비스로 생성한 RSS 피드 사용
  - rss-parser로 RSS 파싱
  - 최신 3개 게시물 추출

