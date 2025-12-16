// index.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');
const Parser = require('rss-parser');

// ==================== 설정 ====================

const app = express();
app.use(express.json());
const rssParser = new Parser();

// 환경 변수
const CONFIG = {
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || 'WsS5zQq6UET5SNzjN0jq',
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || 'w92PtEgAKi',
  INSTAGRAM_RSS_URL: process.env.INSTAGRAM_RSS_URL || 'https://rss.app/feeds/xWmi4R4ZOPbcsOAG.xml',
  PORT: process.env.PORT || 3000,
};

// 상수
const CONSTANTS = {
  CAFE: {
    CLUB_ID: '28434924',
    URL: 'cafe.naver.com/linkus16',
    LIST_URL: 'https://cafe.naver.com/linkus16/ArticleList.nhn?search.clubid=28434924&search.boardtype=L',
  },
  INSTAGRAM: {
    USERNAME: 'linkus_official_',
  },
  LIMITS: {
    POSTS_COUNT: 3,
    DESCRIPTION_LENGTH: 100,
    TITLE_LENGTH: 60,
    API_DISPLAY: 100,
  },
  MESSAGES: {
    NO_PREVIEW: '링크를 클릭해서 전체 내용을 확인하세요 📖',
    NO_CONTENT: '내용 없음',
    ERROR: '최신 소식을 가져오는 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.',
    LOADING: '최신 소식을 가져오고 있어요... 잠시만 기다려주세요! 📰',
  },
};

// ==================== 유틸리티 함수 ====================

/**
 * HTML 태그 제거 및 엔티티 디코딩
 */
function cleanHtml(text) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 텍스트 길이 제한
 */
function truncateText(text, maxLength) {
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '...';
  }
  return text;
}

/**
 * 네이버 API 헤더 생성
 */
function getNaverHeaders() {
  return {
    'X-Naver-Client-Id': CONFIG.NAVER_CLIENT_ID,
    'X-Naver-Client-Secret': CONFIG.NAVER_CLIENT_SECRET,
  };
}

/**
 * 브라우저 헤더 생성
 */
function getBrowserHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9',
  };
}

/**
 * 카카오 응답 포맷 생성
 */
function createKakaoResponse(message) {
  return {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: { text: message },
        },
      ],
    },
  };
}

// ==================== 카페 글 가져오기 ====================

/**
 * HTML 파싱으로 최신 카페 글 가져오기
 */
async function fetchCafePostsFromHtml() {
  const response = await axios.get(CONSTANTS.CAFE.LIST_URL, {
    headers: getBrowserHeaders(),
    responseType: 'arraybuffer',
  });
  
  const html = iconv.decode(Buffer.from(response.data), 'EUC-KR');
  const $html = cheerio.load(html);
  
  const posts = [];
  const seenArticleIds = new Set();
  
  $html('a[href*="ArticleRead.nhn"]').each((index, element) => {
    if (posts.length >= CONSTANTS.LIMITS.POSTS_COUNT) return false;
    
    const $link = $html(element);
    const href = $link.attr('href') || '';
    const title = $link.text().trim();
    
    // articleid 추출
    const articleIdMatch = href.match(/articleid=(\d+)/);
    if (!articleIdMatch) return;
    
    const articleId = articleIdMatch[1];
    
    // 중복 및 유효성 검사
    if (seenArticleIds.has(articleId) || !title || title.length < 2) return;
    if (['[2]', '답글', '댓글'].includes(title)) return;
    if (!href.includes(`clubid=${CONSTANTS.CAFE.CLUB_ID}`)) return;
    
    seenArticleIds.add(articleId);
    
    // 링크 정규화
    let fullLink = href;
    if (href.startsWith('/')) {
      fullLink = `https://cafe.naver.com${href}`;
    } else if (href.startsWith('ArticleRead.nhn')) {
      fullLink = `https://cafe.naver.com/linkus16/${href}`;
    }
    
    posts.push({
      title: cleanHtml(title),
      description: '',
      link: fullLink,
      articleId: articleId,
    });
  });
  
  return posts;
}

/**
 * 네이버 검색 API로 본문 미리보기 보충
 */
async function enrichPostsWithDescription(posts) {
  try {
    const apiUrl = `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent('linkus16')}&display=${CONSTANTS.LIMITS.API_DISPLAY}&sort=date`;
    const response = await axios.get(apiUrl, { headers: getNaverHeaders() });
    
    if (response.data.items) {
      posts.forEach(post => {
        const apiPost = response.data.items.find(item =>
          item.link.includes(`articleid=${post.articleId}`) ||
          item.link.includes(`/${post.articleId}`)
        );
        
        if (apiPost && apiPost.description) {
          let description = cleanHtml(apiPost.description);
          description = truncateText(description, CONSTANTS.LIMITS.DESCRIPTION_LENGTH);
          
          if (description.length >= 10) {
            post.description = description;
          }
        }
        
        if (!post.description || post.description.length < 5) {
          post.description = CONSTANTS.MESSAGES.NO_PREVIEW;
        }
        
        delete post.articleId;
      });
    }
  } catch (error) {
    console.log('네이버 검색 API 오류:', error.message);
    posts.forEach(post => {
      post.description = CONSTANTS.MESSAGES.NO_PREVIEW;
      delete post.articleId;
    });
  }
  
  return posts;
}

/**
 * 네이버 검색 API로 직접 카페 글 가져오기 (폴백)
 */
async function fetchCafePostsFromApi() {
  const url = `https://openapi.naver.com/v1/search/cafearticle.json?query=${encodeURIComponent('링커스 카페')}&display=20&sort=date`;
  const response = await axios.get(url, { headers: getNaverHeaders() });
  
  if (response.data.items && response.data.items.length > 0) {
    return response.data.items
      .filter(item => item.link.includes('cafe.naver.com/linkus16'))
      .slice(0, CONSTANTS.LIMITS.POSTS_COUNT)
      .map(item => ({
        title: cleanHtml(item.title),
        description: truncateText(cleanHtml(item.description) || CONSTANTS.MESSAGES.NO_PREVIEW, 150),
        link: item.link,
      }));
  }
  
  return [];
}

/**
 * 카페 최신 글 가져오기 (메인 함수)
 */
async function fetchCafePosts() {
  try {
    const posts = await fetchCafePostsFromHtml();
    
    if (posts.length === 0) {
      console.log('HTML 파싱 실패, 네이버 검색 API로 폴백');
      return await fetchCafePostsFromApi();
    }
    
    await enrichPostsWithDescription(posts);
    console.log(`카페 최신 글 ${posts.length}개 가져오기 완료`);
    return posts;
    
  } catch (error) {
    console.error('카페 글 가져오기 오류:', error.message);
    return await fetchCafePostsFromApi();
  }
}

// ==================== 인스타그램 게시물 가져오기 ====================

/**
 * RSS 피드에서 인스타그램 게시물 가져오기
 */
async function fetchInstagramPosts() {
  try {
    if (!CONFIG.INSTAGRAM_RSS_URL) {
      console.log('Instagram RSS URL이 설정되지 않았습니다.');
      return [];
    }
    
    const feed = await rssParser.parseURL(CONFIG.INSTAGRAM_RSS_URL);
    
    if (!feed.items || feed.items.length === 0) {
      console.log('RSS 피드에서 게시물을 찾을 수 없습니다.');
      return [];
    }
    
    const posts = feed.items.slice(0, CONSTANTS.LIMITS.POSTS_COUNT).map(item => {
      // RSS description에서 실제 캡션 추출 (HTML 제거)
      const rawCaption = cleanHtml(item.contentSnippet || item.content || item.description || '');
      
      // 해시태그와 불필요한 공백 제거
      let caption = rawCaption
        .replace(/#[^\s#]+/g, '')  // 해시태그 제거
        .replace(/\s+/g, ' ')       // 여러 공백을 하나로
        .trim();
      
      // 캡션이 너무 길면 자르기
      caption = truncateText(caption, 150) || CONSTANTS.MESSAGES.NO_CONTENT;
      
      return {
        title: '인스타그램 게시물',  // 간단한 라벨
        description: caption,          // 실제 캡션
        link: item.link || item.guid || '',
      };
    });
    
    console.log(`RSS 피드에서 ${posts.length}개 게시물 가져옴`);
    return posts;
    
  } catch (error) {
    console.error('인스타그램 RSS 피드 가져오기 오류:', error.message);
    return [];
  }
}

// ==================== 메시지 포맷팅 ====================

/**
 * 게시물 목록을 텍스트로 포맷팅
 */
function formatPostList(posts) {
  return posts.map((post, index) => {
    return `${index + 1}. ${post.title}\n${post.description}\n🔗 ${post.link}\n`;
  }).join('\n');
}

/**
 * 카카오톡 메시지 포맷팅
 */
function formatNewsMessage(cafePosts, instaPosts) {
  const sections = [];
  
  // 카페 섹션
  sections.push('📌 링커스 카페 최신 글\n');
  if (cafePosts.length > 0) {
    sections.push(formatPostList(cafePosts));
  } else {
    sections.push('최신 글을 가져오지 못했습니다.\n');
  }
  
  // 인스타그램 섹션
  sections.push('📸 인스타그램 최신 게시물\n');
  if (instaPosts.length > 0) {
    sections.push(formatPostList(instaPosts));
  } else {
    sections.push('최신 게시물을 가져오지 못했습니다.\n');
  }
  
  return sections.join('\n');
}

// ==================== 카카오 스킬 핸들러 ====================

/**
 * 콜백 응답 전송
 */
async function sendCallbackResponse(callbackUrl, responseData) {
  try {
    await axios.post(callbackUrl, responseData, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log('>>> 콜백 응답 전송 성공');
  } catch (error) {
    console.error('>>> 콜백 응답 전송 실패:', error.message);
    throw error;
  }
}

/**
 * 뉴스 데이터 가져오기 및 포맷팅
 */
async function getFormattedNews() {
  const [cafePosts, instaPosts] = await Promise.all([
    fetchCafePosts(),
    fetchInstagramPosts(),
  ]);
  
  console.log(`카페 글: ${cafePosts.length}개, 인스타: ${instaPosts.length}개`);
  
  return formatNewsMessage(cafePosts, instaPosts);
}

/**
 * 카카오 스킬 엔드포인트
 */
app.post('/linkus-news', async (req, res) => {
  const callbackUrl = req.body?.userRequest?.callbackUrl || null;
  
  console.log('=== /linkus-news 요청 시작 ===');
  console.log('콜백 모드:', callbackUrl ? '활성화' : '비활성화');
  
  // 콜백 모드 (비동기)
  if (callbackUrl) {
    // 즉시 응답 반환
    res.json({
      version: '2.0',
      useCallback: true,
      data: { text: CONSTANTS.MESSAGES.LOADING },
    });
    
    // 비동기로 데이터 처리 및 콜백 전송
    (async () => {
      try {
        console.log('>>> 비동기 처리 시작');
        const message = await getFormattedNews();
        await sendCallbackResponse(callbackUrl, createKakaoResponse(message));
        console.log('>>> 콜백 응답 전송 완료');
      } catch (error) {
        console.error('>>> 처리 중 오류:', error);
        try {
          await sendCallbackResponse(callbackUrl, createKakaoResponse(CONSTANTS.MESSAGES.ERROR));
        } catch (callbackErr) {
          console.error('콜백 오류 응답 전송 실패:', callbackErr);
        }
      }
    })();
    
    return;
  }
  
  // 일반 모드 (동기)
  try {
    const message = await getFormattedNews();
    return res.json(createKakaoResponse(message));
  } catch (error) {
    console.error('처리 중 오류:', error);
    return res.json(createKakaoResponse(CONSTANTS.MESSAGES.ERROR));
  }
});

// ==================== 서버 시작 ====================

// 헬스체크 엔드포인트
app.get('/', (req, res) => {
  res.send('Linkus News Skill Server OK');
});

// 서버 시작
app.listen(CONFIG.PORT, () => {
  console.log(`Server listening on port ${CONFIG.PORT}`);
  console.log(`카페 URL: ${CONSTANTS.CAFE.URL}`);
  console.log(`인스타그램: ${CONSTANTS.INSTAGRAM.USERNAME}`);
});
