// 긴 본문 템플릿 (300~500자) - 매크로 탐지 방지용 다양한 문구

// 도입부 (랜덤 선택)
const intros = [
  (name) => `요즘 ${name.split(' ').slice(0, 2).join(' ')} 찾으시는 분들 많으시죠? 저도 한참 고민하다가 이 제품 발견했어요.`,
  (name) => `${name.split(' ').slice(0, 2).join(' ')} 어디서 사야하나 고민하다가 좋은 거 찾아서 공유드려요!`,
  (name) => `혹시 ${name.split(' ').slice(0, 2).join(' ')} 구매 고민중이신 분 계신가요? 제가 찾은 정보 공유해볼게요.`,
  (name) => `오늘은 ${name.split(' ').slice(0, 2).join(' ')} 소개해드리려고 해요. 여러 제품 비교해봤는데 이게 제일 괜찮더라고요.`,
  (name) => `${name.split(' ').slice(0, 2).join(' ')} 관심있으신 분들 주목! 좋은 제품 발견해서 알려드려요.`,
  (name) => `요즘 핫한 ${name.split(' ').slice(0, 2).join(' ')}! 저도 관심있어서 찾아봤는데 괜찮아 보여요.`,
  (name) => `${name.split(' ').slice(0, 2).join(' ')} 추천 요청이 많아서 제가 직접 찾아봤어요!`,
  (name) => `이번에 새로 나온 ${name.split(' ').slice(0, 2).join(' ')} 정보 공유합니다~`,
];

// 상품 설명 (랜덤 선택) - 일반적인 장점 설명
const descriptions = [
  (name, price) => `이 제품의 가장 큰 장점은 품질 대비 가격이 정말 합리적이라는 거예요. ${price ? `현재 ${price}에 판매중인데` : '가격도 착한 편이고'} 다른 비슷한 제품들이랑 비교해봐도 이게 제일 가성비 좋더라고요. 디자인도 깔끔하고 실용적이에요.`,

  (name, price) => `제가 이 제품을 선택한 이유는 일단 리뷰가 좋았어요. 실제 구매하신 분들 후기 보니까 만족도가 높더라고요. ${price ? `가격은 ${price}인데` : '가격도 적당하고'} 품질 생각하면 충분히 값어치 하는 것 같아요.`,

  (name, price) => `요즘 이런 제품들 많이 나오는데, 이건 특히 마감이 좋아요. 세부적인 디테일까지 신경 쓴 느낌이랄까요? ${price ? `${price}면` : '이 가격이면'} 괜찮은 선택인 것 같아요. 배송도 빠르다고 하더라고요.`,

  (name, price) => `솔직히 처음엔 반신반의했는데, 상세페이지 보니까 꽤 괜찮아 보여요. 소재도 좋고 기능성도 있고요. ${price ? `${price}라는 가격도` : '가격도'} 부담스럽지 않아서 한번 써볼 만한 것 같아요.`,

  (name, price) => `이 브랜드 제품 처음 보는 분들도 계실 텐데, 의외로 품질 좋기로 유명해요. 가격 대비 만족도가 높은 편이고요. ${price ? `현재 ${price}에` : ''} 구매 가능하니까 관심있으시면 확인해보세요.`,

  (name, price) => `제가 여러 제품 비교해봤는데 이게 제일 실용적이더라고요. 디자인도 무난하고 어디에나 잘 어울려요. ${price ? `${price}면` : '가격도'} 합리적인 편이에요. 후회 없을 것 같아요.`,

  (name, price) => `상세페이지에 나온 것처럼 퀄리티가 좋아 보여요. 사용하시는 분들 리뷰도 대체로 긍정적이고요. ${price ? `가격은 ${price}인데` : ''} 이 정도면 충분히 가치 있는 소비라고 생각해요.`,

  (name, price) => `요즘 이런 아이템 필수라고 하잖아요. 저도 하나 있으면 좋겠다 싶어서 찾아봤어요. ${price ? `${price}에` : ''} 이 정도 퀄리티면 만족스러울 것 같아요. 디자인도 예쁘고요.`,
];

// 마무리 (랜덤 선택)
const endings = [
  (link) => `관심있으신 분들은 링크 확인해보세요! 도움이 되셨으면 좋겠네요 :)`,
  (link) => `필요하신 분들 참고하시라고 링크 남겨둘게요~ 좋은 쇼핑 되세요!`,
  (link) => `자세한 정보는 링크에서 확인해보실 수 있어요. 궁금한 점 있으시면 댓글 남겨주세요!`,
  (link) => `링크 남겨드릴 테니 구경해보세요~ 다들 득템하시길 바랍니다!`,
  (link) => `더 자세한 건 링크에서 확인하시면 돼요. 모두 현명한 소비하세요~`,
  (link) => `관심있으신 분들 링크 타고 구경해보세요! 후회 없으실 거예요 ㅎㅎ`,
  (link) => `링크 첨부해드릴게요. 고민되시면 상세페이지 먼저 확인해보세요!`,
  (link) => `아래 링크에서 더 자세히 보실 수 있어요. 좋은 정보 되셨으면 좋겠습니다~`,
];

// 추가 문구 (랜덤으로 포함 여부 결정)
const extras = [
  `요즘 같은 시기에 딱 필요한 아이템이에요.`,
  `선물용으로도 괜찮을 것 같아요.`,
  `재고 있을 때 사두시는 게 좋을 듯해요.`,
  `품절되기 전에 확인해보세요!`,
  `다른 분들도 많이 찾으시는 제품이에요.`,
  `리뷰 보니까 재구매율도 높더라고요.`,
  `가격 대비 정말 괜찮은 것 같아요.`,
  `저도 찜해뒀다가 사려고요 ㅎㅎ`,
  `이 가격에 이 퀄리티는 진짜 드물어요.`,
  `배송도 빠르다고 하니까 급하신 분들도 좋을 것 같아요.`,
];

// 중간 문구 (추가 설명)
const middles = [
  (name) => `${name.split(' ').slice(0, 2).join(' ')} 같은 제품은 요즘 정말 많이 나오는데요, 그 중에서도 이 제품이 눈에 띄는 이유가 있어요. 일단 상세페이지를 보면 제조 과정이나 원재료에 대한 설명이 꼼꼼하게 나와있더라고요.`,

  (name) => `사실 저도 처음에는 ${name.split(' ').slice(0, 2).join(' ')} 종류가 다 비슷비슷할 줄 알았는데, 막상 비교해보니까 차이가 있더라고요. 특히 이 제품은 세부적인 부분에서 신경 쓴 게 느껴져요.`,

  (name) => `요즘 ${name.split(' ').slice(0, 2).join(' ')} 관련 제품들 리뷰를 많이 찾아봤는데요, 대부분의 구매자분들이 만족하시는 것 같아요. 특히 품질이나 마감 부분에서 좋은 평가가 많더라고요.`,

  (name) => `이런 종류의 제품은 처음 구매할 때 고민이 많이 되잖아요. 저도 한참 고민하다가 결국 이걸로 정했는데, 상세페이지에 나온 정보들이 믿음이 가더라고요.`,

  (name) => `${name.split(' ').slice(0, 2).join(' ')} 검색하면 비슷한 제품들이 엄청 많이 나오는데요, 그 중에서 이 제품을 선택한 이유는 리뷰가 진짜 좋았기 때문이에요. 실제 사용하신 분들 후기를 보면 대부분 긍정적이에요.`,
];

// 상품 특징 설명
const features = [
  `특히 좋았던 점은 포장이 꼼꼼하다는 거예요. 배송 중에 파손될 걱정 없이 잘 도착하더라고요. 그리고 제품 자체도 상세페이지에서 본 것과 동일해서 만족스러웠어요.`,

  `이 제품의 장점은 가격 대비 퀄리티가 좋다는 거예요. 비슷한 가격대의 다른 제품들이랑 비교해봐도 이게 제일 괜찮아 보여요. 디자인도 깔끔하고 실용적이에요.`,

  `상세페이지에 나온 것처럼 품질이 좋아요. 마감도 깔끔하고, 세부적인 부분까지 신경 쓴 느낌이에요. 이 가격에 이 정도면 충분히 값어치 한다고 생각해요.`,

  `제가 이 제품을 추천하는 이유는 일단 리뷰가 정말 좋아요. 실제 구매하신 분들 평가를 보면 재구매율도 높고, 대부분 만족하시더라고요. 저도 기대가 되네요.`,

  `디자인도 예쁘고 기능성도 좋아서 일석이조예요. 요즘 이런 제품들이 많이 나오는데, 그 중에서도 이건 퀄리티가 확실히 다르다는 느낌이 들어요.`,
];

// 랜덤 본문 생성 (500~800자로 확장)
export function getRandomContent(productName, price) {
  const intro = intros[Math.floor(Math.random() * intros.length)](productName);
  const desc = descriptions[Math.floor(Math.random() * descriptions.length)](productName, price);
  const ending = endings[Math.floor(Math.random() * endings.length)]();

  // 70% 확률로 중간 설명 추가
  let middle = '';
  if (Math.random() > 0.3) {
    middle = '\n\n' + middles[Math.floor(Math.random() * middles.length)](productName);
  }

  // 60% 확률로 상품 특징 추가
  let feature = '';
  if (Math.random() > 0.4) {
    feature = '\n\n' + features[Math.floor(Math.random() * features.length)];
  }

  // 50% 확률로 추가 문구 포함
  let extra = '';
  if (Math.random() > 0.5) {
    extra = '\n\n' + extras[Math.floor(Math.random() * extras.length)];
  }

  const content = `${intro}\n\n${desc}${middle}${feature}${extra}\n\n${ending}`;

  return content;
}

// 짧은 버전 (기존 호환용)
export function getShortContent(productName, price) {
  const templates = [
    `${productName.split(' ').slice(0, 2).join(' ')} 찾다가 발견! ${price ? `${price}` : ''} 괜찮아 보여요~`,
    `요즘 핫한 ${productName.split(' ').slice(0, 2).join(' ')}! ${price ? `현재 ${price}` : ''} 관심있으신 분 확인해보세요`,
    `${productName.split(' ').slice(0, 3).join(' ')} 정보 공유해요 ${price ? `${price}이에요` : ''} 링크 남겨둡니다`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

export default { getRandomContent, getShortContent };
