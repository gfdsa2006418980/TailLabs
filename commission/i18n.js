(() => {
  'use strict';

  // Chinese source text is the stable key. Update both translations when copy changes.
  const copy = [
    ["你腦中的遊戲 可以開始玩了｜浣熊拉芙遊戲委託", "Your game idea, ready to play | Rafu Game Commissions", "頭の中のゲームを遊べるカタチに｜浣熊ラフのゲーム制作"],
    ["跳至主要內容", "Skip to content", "本文へスキップ"],
    ["浣熊拉芙", "Rafu", "浣熊ラフ"],
    ["遊戲委託", "Game commissions", "ゲーム制作"],
    ["選擇方案", "Plans", "プラン"],
    ["疊疊樂範例", "Stacking demo", "制作例"],
    ["諮詢與加購", "Consulting & extras", "相談・追加サービス"],
    ["委託須知", "Commission guide", "ご依頼について"],
    ["聊聊委託", "Let's talk", "依頼の相談"],
    ["浣熊拉芙・遊戲開發與設計", "Rafu · Game development & design", "浣熊ラフ・ゲーム開発とデザイン"],
    ["你腦中的遊戲", "Your game idea", "頭の中のゲームを"],
    ["可以開始玩了", "Ready to play", "遊べるカタチに"],
    ["Hi，我是浣熊拉芙", "Hi, I'm Rafu", "こんにちは、浣熊ラフです"],
    ["帶著想法或參考遊戲來，我們一起把它做出來", "Bring an idea or a game you love, and let's build it together", "アイデアや参考ゲームから、一緒に作りましょう"],
    ["找到你的方案", "Find your plan", "プランを選ぶ"],
    ["先玩玩疊疊樂", "Try the stacking game", "積み上げゲームで遊ぶ"],
    ["從你的想法開始", "It starts with your idea", "アイデアから始まる"],
    ["如果我可以實現它？", "What if I could make it?", "これを実現できたら？"],
    ["遊戲玩法示意", "Gameplay preview", "ゲームプレイのイメージ"],
    ["創意實驗室", "Idea lab", "アイデアラボ"],
    ["把你的想法，一層層疊起來。", "Build your idea, one layer at a time.", "アイデアを、一つずつ積み上げよう。"],
    ["換個組合", "Remix", "組み替える"],
    ["從想法，到精彩體驗", "From idea to play", "アイデアを遊びへ"],
    ["我想做超酷的關卡", "I want to make amazing levels", "最高のステージを作りたい"],
    ["玩法設計", "Gameplay design", "遊びの設計"],
    ["遊戲開發", "Game development", "ゲーム開発"],
    ["關卡設計", "Level design", "ステージ設計"],
    ["三種方案，一起做出你的遊戲", "Three plans to bring your game to life", "3つのプランで、あなたのゲームを形に"],
    ["你想做什麼遊戲？", "What would you like to make?", "どんなゲームを作りたい？"],
    ["從第一個可玩版本，到更完整的遊戲。", "From your first playable version to a fuller game.", "最初の遊べるバージョンから、より充実したゲームまで。"],
    ["基本方案", "Basic plan", "基本プラン"],
    ["先讓想法，", "Make your idea", "まずはアイデアを"],
    ["玩得起來。", "playable.", "遊べる形に。"],
    ["想做一款單純的小遊戲？", "Thinking of a simple little game?", "シンプルなミニゲームを作りたい？"],
    ["從核心玩法開始就很好。", "Start with the core gameplay.", "まずは中心となる遊びから。"],
    ["起", "and up", "〜"],
    ["我想先做出來", "Make a first version", "まずは作ってみたい"],
    ["是個遊戲，就從這裡開始。", "Your first playable game starts here.", "最初のゲームは、ここから。"],
    ["核心玩法與遊戲本體", "Core gameplay and game development", "中心となる遊びとゲーム本体"],
    ["基本操作、流程與勝負判定", "Controls, game flow, and win/loss rules", "基本操作・ゲームの流れ・勝敗判定"],
    ["基本操作介面與資訊顯示", "Essential controls and information UI", "基本操作UIと情報表示"],
    ["至少 3 包玩法／功能調整", "At least 3 sets of gameplay / feature changes", "遊び・機能の調整を3枠以上"],
    ["關卡設計、音樂與音效未包含。", "Level design, music, and sound effects are excluded.", "ステージ設計・音楽・効果音は含みません。"],
    ["看疊疊樂能做到哪裡", "See the basic game", "基本プランの制作例"],
    ["推薦方案", "Recommended", "おすすめ"],
    ["進階方案", "Advanced plan", "上級プラン"],
    ["想讓玩家，", "Keep them", "プレイヤーに"],
    ["再玩一局？", "coming back?", "もう一回遊んでほしい？"],
    ["加上引導、難度和聲音，", "Add guidance, challenge, and sound", "ガイド・難易度・サウンドで、"],
    ["讓遊玩體驗更完整。", "for a fuller play experience.", "遊びの体験をもっと豊かに。"],
    ["我想做得更完整", "Build a fuller game", "もっと充実させたい"],
    ["包含基本方案，再多一點好玩。", "Everything in Basic, with more to enjoy.", "基本プランに、楽しさをプラス。"],
    ["較完整的玩法流程與操作引導", "Fuller game flow and player guidance", "充実したゲームの流れと操作ガイド"],
    ["基本關卡、數值與難度曲線", "Basic levels, balancing, and difficulty curve", "基本ステージ・数値調整・難易度曲線"],
    ["UI 動態與物件動畫", "UI motion and object animation", "UI演出とオブジェクトアニメーション"],
    ["免費音樂、音效素材整合", "Integration of free music and sound assets", "無料の音楽・効果音素材の組み込み"],
    ["基本效能優化與背景設定", "Basic performance tuning and setting design", "基本的な動作最適化と背景設定"],
    ["現在的蛇貂疊疊樂，就是這個方向。", "Snake Marten Stack is an example of this plan.", "現在の蛇貂積みゲームが、このプランの制作例です。"],
    ["看看進階方案的樣子", "See the advanced game", "上級プランの制作例"],
    ["豪華方案", "Deluxe plan", "デラックスプラン"],
    ["你的遊戲，", "Your game,", "あなたのゲームを、"],
    ["還想玩更大？", "with bigger ideas?", "もっと大きく育てたい？"],
    ["多種模式、特殊規則，", "Multiple modes, special rules,", "多彩なモードや特別なルール、"],
    ["或是一整套自己的遊戲系統。", "or a complete set of custom game systems.", "あなただけのゲームシステムまで。"],
    ["客製報價", "Custom quote", "個別お見積もり"],
    ["聊聊我的大計畫", "Let's plan something big", "大きなアイデアを相談する"],
    ["包含進階方案，再照你的想法擴充。", "Everything in Advanced, expanded around your ideas.", "上級プランをベースに、アイデアに合わせて拡張。"],
    ["更完整的玩法、關卡與數值系統", "Expanded gameplay, levels, and balancing systems", "より充実した遊び・ステージ・数値システム"],
    ["多種遊戲模式與特殊機制", "Multiple game modes and special mechanics", "複数のゲームモードと特殊な仕組み"],
    ["可討論成就、存檔與排行榜", "Optional achievements, saves, and leaderboards", "実績・セーブ・ランキングも相談可能"],
    ["客製音樂與音效製作規劃", "Production planning for custom music and sound", "オリジナル音楽・効果音の制作計画"],
    ["完整世界觀與背景設定規劃", "Full worldbuilding and setting planning", "世界観と背景設定の全体計画"],
    ["製作範圍、方式與工期一起確認。", "We'll agree on scope, production approach, and schedule.", "制作範囲・進め方・納期を一緒に確認します。"],
    ["看看還能怎麼玩", "Explore the possibilities", "さらに広がる遊びを見る"],
    ["單次委託・新臺幣計價・依複雜度與功能確認報價", "One-time commissions · Prices in TWD · Final quote based on scope and complexity", "単発の制作依頼・台湾ドル表記・複雑さと機能に応じてお見積もり"],
    ["開始之前，幾件小事。", "A few things before we start.", "始める前に、いくつか。"],
    ["完整須知", "Full guide", "詳しく見る"],
    ["報價與付款", "Quotes & payment", "お見積もり・お支払い"],
    ["報價", "Quote", "お見積もり"],
    ["依遊戲複雜度與功能確認", "Based on game complexity and features", "ゲームの複雑さと機能で決定"],
    ["訂金", "Deposit", "着手金"],
    ["開工前支付 30%", "30% before work begins", "制作開始前に30%"],
    ["尾款", "Balance", "残金"],
    ["完成後付 70%，收齊交付遊戲", "70% on completion; delivery after full payment", "完成後に70%、入金確認後に納品"],
    ["驗收", "Acceptance", "検収"],
    ["1 個月內驗收並支付尾款", "Review and pay the balance within 1 month", "1か月以内に検収と残金のお支払い"],
    ["作品使用", "Usage rights", "作品の利用"],
    ["商用、轉交與展示依需求議價", "Commercial use, transfer, and display priced by agreement", "商用利用・譲渡・公開は内容に応じて相談"],
    ["素材與交付", "Assets & delivery", "素材・納品"],
    ["委託資料", "Your brief", "依頼情報"],
    ["想法、參考遊戲、預算與交期", "Idea, references, budget, and deadline", "アイデア・参考作品・予算・納期"],
    ["美術", "Artwork", "画像素材"],
    ["自備所有美術圖，或另洽阿言", "Provide all artwork, or commission Ayan separately", "すべてご用意いただくか、アヤンへ別途依頼"],
    ["聲音", "Audio", "音声素材"],
    ["進階用免費素材，客製另估", "Advanced uses free assets; custom audio quoted separately", "上級は無料素材、個別制作は別途見積もり"],
    ["背景", "Setting", "背景設定"],
    ["進階含基本設定，也可自備", "Advanced includes a basic setting, or provide your own", "上級は基本設定を含む、持ち込みも可能"],
    ["交付", "Delivery", "納品"],
    ["應用程式；平台上架另行估價", "Application delivery; publishing quoted separately", "アプリ形式で納品、ストア公開は別途見積もり"],
    ["調整與取消", "Changes & cancellation", "調整・キャンセル"],
    ["修改", "Revisions", "修正"],
    ["交付前至少含 3 包調整", "At least 3 sets of changes before delivery", "納品前の調整を3枠以上含む"],
    ["追加", "Additions", "追加"],
    ["超出約定範圍，另行報價", "Work beyond the agreed scope is quoted separately", "合意した範囲外は別途見積もり"],
    ["原功能 Bug，交付後保固 1 個月", "1-month bug warranty for agreed features", "合意した機能の不具合は納品後1か月保証"],
    ["取消", "Cancellation", "キャンセル"],
    ["依完成度收取報價 30%～70%", "30%–70% of the quote, based on progress", "進捗に応じて見積額の30%〜70%"],
    ["再委託", "New requests", "再依頼"],
    ["取消後 6 個月內原則上不承接", "Generally unavailable for 6 months after cancellation", "原則、キャンセル後6か月は受付不可"],
    ["用蛇貂疊疊樂，看懂製作範圍", "See the scope through Snake Marten Stack", "蛇貂積みゲームで見る制作範囲"],
    ["同一個想法，", "One idea,", "同じアイデアから、"],
    ["可以玩到哪裡？", "how far can it go?", "どこまで遊びを広げる？"],
    ["基本方案示例", "Basic plan example", "基本プランの制作例"],
    ["進階方案示例", "Advanced plan example", "上級プランの制作例"],
    ["豪華方案擴充構想", "Deluxe expansion ideas", "デラックスプランの拡張案"],
    ["操作引導", "Player guidance", "操作ガイド"],
    ["難度變化", "Difficulty changes", "難易度の変化"],
    ["音樂與動態", "Music & motion", "音楽と演出"],
    ["核心玩法", "Core gameplay", "中心となる遊び"],
    ["堆疊與計分", "Stacking & scoring", "積み上げとスコア"],
    ["失敗後重來", "Try again", "失敗したらリトライ"],
    ["多種模式", "Multiple modes", "多彩なモード"],
    ["特殊蛇貂", "Special characters", "特別な蛇貂"],
    ["升級與成就", "Upgrades & achievements", "強化と実績"],
    ["實際玩玩蛇貂疊疊樂", "Play Snake Marten Stack", "蛇貂積みゲームで遊ぶ"],
    ["基本", "Basic", "基本"],
    ["進階", "Advanced", "上級"],
    ["豪華", "Deluxe", "デラックス"],
    ["基本方案・NT$2,000 起", "Basic plan · From NT$2,000", "基本プラン・NT$2,000〜"],
    ["放下去。疊起來。", "Drop it. Stack it.", "落として、積み上げて。"],
    ["看看能有多高。", "How high can you go?", "どこまで高くできる？"],
    ["先把最核心的堆疊樂趣做出來。", "Start with the simple joy of stacking.", "まずは積み上げる楽しさを形に。"],
    ["無限堆疊", "Endless stacking", "無限に積み上げる"],
    ["放置蛇貂，讓牠們落下、堆疊。", "Place the characters, let them drop, and build a stack.", "蛇貂を配置して、落として、積み上げます。"],
    ["計分與結算", "Scoring & results", "スコアとリザルト"],
    ["依高度或數量計分，失敗後重新開始。", "Score by height or count, then restart after a failed attempt.", "高さや数でスコアを計算し、失敗したら再挑戦。"],
    ["單純好上手", "Simple to pick up", "シンプルで遊びやすい"],
    ["這個版本不加入教學與難度變化。", "This version has no tutorial or difficulty progression.", "このバージョンにはチュートリアルや難易度変化を含みません。"],
    ["進階方案・NT$5,000 起", "Advanced plan · From NT$5,000", "上級プラン・NT$5,000〜"],
    ["從會玩，", "Learn the basics,", "遊び方を覚えて、"],
    ["到越玩越上手。", "then master the game.", "遊ぶほど上達する。"],
    ["現在的蛇貂疊疊樂，就是這個製作方向。", "The current Snake Marten Stack follows this approach.", "現在の蛇貂積みゲームが、この制作方針の例です。"],
    ["先學會，再挑戰", "Learn, then take on a challenge", "覚えてから、挑戦へ"],
    ["加入操作引導與難度變化。", "Add player guidance and changing difficulty.", "操作ガイドと難易度の変化を追加。"],
    ["每一疊都有回饋", "Feedback with every drop", "積み上げるたびに反応"],
    ["落下的彈跳動態，加上 UI 回饋。", "Bouncing objects and responsive UI feedback.", "落下時の弾む動きと、UIの反応を追加。"],
    ["讓遊戲有聲音", "Bring in the sound", "ゲームに音を"],
    ["整合基本背景音樂與音效。", "Integrate basic background music and sound effects.", "基本的なBGMと効果音を組み込みます。"],
    ["豪華方案・依需求報價", "Deluxe plan · Custom quote", "デラックスプラン・個別見積もり"],
    ["這一局，", "A new round,", "次のプレイでは、"],
    ["又會有什麼新花樣？", "a new surprise?", "どんな変化が待っている？"],
    ["從疊疊樂出發，延伸出自己的遊戲。", "Build on the stacking idea to create a game of your own.", "積み上げゲームを出発点に、自分だけのゲームへ。"],
    ["更多玩法", "More ways to play", "もっと多彩な遊び"],
    ["自由堆疊、關卡挑戰，或限時模式。", "Free stacking, level challenges, or timed modes.", "自由に積むモード、ステージ挑戦、時間制限モードなど。"],
    ["更多變化", "More variety", "もっと豊かな変化"],
    ["特殊蛇貂、不同大小、場地與規則。", "Special characters, different sizes, arenas, and rules.", "特別な蛇貂、大きさの違い、ステージやルールの変化。"],
    ["更多系統", "More systems", "もっと多くのシステム"],
    ["可討論 Rogue-like 升級選擇、成就、存檔與排行榜。", "Discuss roguelike upgrades, achievements, saves, and leaderboards.", "ローグライクな強化選択・実績・セーブ・ランキングも相談可能。"],
    ["以上為可討論的擴充方向，依需求確認範圍。", "These are possible extensions; the scope is agreed around your needs.", "拡張の一例です。具体的な範囲はご相談のうえ決定します。"],
    ["這個方向很適合我", "This is what I have in mind", "この方向で相談したい"],
    ["也可以先聊聊", "Let's talk it through", "まずは相談から"],
    ["有想法。", "Have an idea?", "アイデアはあるけれど、"],
    ["還沒想好怎麼做？", "Figuring out the next step?", "作り方に迷っている？"],
    ["從玩法、技術到製作範圍，", "From gameplay and technology to scope,", "遊びの設計から技術、制作範囲まで、"],
    ["一起找出下一步。", "let's work out your next step.", "次の一歩を一緒に考えましょう。"],
    ["初步委託洽談", "Initial commission chat", "ご依頼前の相談"],
    ["免費", "Free", "無料"],
    ["先說說，你想做什麼。", "Tell me what you'd like to make.", "まずは、作りたいものを教えてください。"],
    ["用文字聊聊遊戲類型、需求、預算與交期，確認是否承接，以及適合的方案。", "Chat by text about the game, requirements, budget, and deadline to confirm availability and a suitable plan.", "ゲームの種類・ご要望・予算・納期をテキストで伺い、お引き受けできるかと適したプランを確認します。"],
    ["我想先聊聊", "Start a conversation", "まずは相談する"],
    ["深入諮詢", "In-depth consultation", "詳しいご相談"],
    ["／30 分鐘", " / 30 min", "／30分"],
    ["想把方向，想得更清楚。", "Find a clearer direction.", "進める方向を、もっと明確に。"],
    ["玩法拆解、關卡數值、技術可行性、開發順序，或目前卡住的問題，都可以談。", "Discuss gameplay analysis, level balancing, technical feasibility, development priorities, or a problem you're stuck on.", "遊びの分析、ステージや数値、技術的な実現性、開発の順序、行き詰まっていることまで相談できます。"],
    ["預約深入諮詢", "Book a consultation", "詳しい相談を予約する"],
    ["大量資料預讀、完整文件或實作，依需求另行報價。", "Extensive advance reading, full documents, and implementation are quoted separately.", "大量の資料の事前確認、文書作成、実装は別途お見積もりします。"],
    ["加購選項", "Optional extras", "追加サービス"],
    ["做好了，", "Your game's ready", "ゲームができたら、"],
    ["想讓大家在哪裡玩？", "Where will people play?", "どこで遊んでもらう？"],
    ["選擇平台，我也能協助處理上架。", "Choose a platform, and I can help with publishing.", "公開先を選んで、リリースの手続きもご相談ください。"],
    ["推薦", "Recommended", "おすすめ"],
    ["使用我的帳號上架，免收此項費用。", "No publishing service fee when using my account.", "私のアカウントで公開する場合、この料金は無料です。"],
    ["平台上架與相容性需求評估。", "Publishing assistance and compatibility assessment.", "公開手続きと互換性の要件を確認します。"],
    ["約 NT$500", "~NT$500", "約NT$500"],
    ["依平台規費與相容性需求評估。", "Quoted based on platform fees and compatibility needs.", "プラットフォーム料金と互換性の要件に応じて見積もり。"],
    ["約 NT$5,000", "~NT$5,000", "約NT$5,000"],
    ["包含上架、相容性處理與商務洽談。", "Publishing, compatibility work, and business discussions.", "公開手続き・互換性対応・商務交渉を含みます。"],
    ["約 NT$20,000～50,000", "~NT$20,000–50,000", "約NT$20,000〜50,000"],
    ["約 NT$2,000", "~NT$2,000", "約NT$2,000"],
    ["不上架", "No publishing", "公開代行なし"],
    ["以應用程式形式交付。", "Delivered as an application.", "アプリケーション形式で納品します。"],
    ["無上架費", "No publishing fee", "公開手数料なし"],
    ["以上為上架服務估價，實際費用依平台規費、相容性調整與代辦範圍確認。", "Publishing estimates are confirmed based on platform fees, compatibility work, and the scope of assistance.", "公開サービスの概算です。実際の料金はプラットフォーム料金・互換性対応・代行範囲に応じて決定します。"],
    ["阿言・美術圖／遊戲 UI 設計", "Ayan · Artwork & game UI design", "アヤン・イラスト／ゲームUIデザイン"],
    ["想連畫面，也一起準備好？", "Need artwork for your game too?", "ゲームのビジュアルも揃えたい？"],
    ["美術圖由你自備；需要訂製美術或 UI，可以另洽阿言。", "Please provide your artwork. For custom art or UI, you can commission Ayan separately.", "画像素材はご用意ください。オリジナルのイラストやUIは、アヤンへ別途ご依頼いただけます。"],
    ["查看阿言資訊", "About Ayan", "アヤンの情報を見る"],
    ["下一款遊戲，從你開始", "The next game starts with you", "次のゲームは、あなたから"],
    ["你的想法", "Your idea", "あなたのアイデア"],
    ["我想聽聽", "I'd love to hear it", "聞かせてください"],
    ["帶上你的超酷想法，還有你希望完成的時間，還有你的預算。", "Bring your amazing idea, your preferred deadline, and your budget.", "とっておきのアイデアと、希望の納期、予算を教えてください。"],
    ["到 Discord 找我", "Find me on Discord", "Discordで相談する"],
    ["準備委託訊息", "Prepare your brief", "依頼メッセージを作る"],
    ["不定期開放委託，實際檔期與承接範圍請先私訊確認。", "Commissions open periodically. Please message me to confirm availability and scope.", "不定期で依頼を受け付けています。受付状況と対応範囲は、事前にDMでご確認ください。"],
    ["詳細注意事項", "The full commission guide", "ご依頼にあたって"],
    ["細節，都在這裡。", "All the details are here.", "詳しい内容はこちら。"],
    ["原始委託文件", "Original commission document", "元の依頼案内"],
    ["委託資料與報價", "Your brief & quote", "依頼情報とお見積もり"],
    ["委託時請提供", "Please include", "ご依頼時にご用意いただくもの"],
    ["遊戲想法或參考作品、預算範圍及期望交期。", "Your game idea or references, budget range, and preferred deadline.", "ゲームのアイデアまたは参考作品、予算の範囲、希望納期。"],
    ["報價與製作範圍", "Pricing & scope", "料金と制作範囲"],
    ["所有金額皆為新臺幣，依單次遊戲委託計費。方案與疊疊樂內容為製作方向舉例；實際功能、關卡數量、數值設計、素材需求與工期，以確認後的需求清單及報價為準。", "All amounts are in New Taiwan dollars (TWD) and charged per commission. Plans and stacking-game examples illustrate possible directions. Final features, level counts, balancing, asset needs, and schedules follow the agreed requirements and quote.", "金額はすべて台湾ドル（TWD）で、単発の制作依頼ごとにお見積もりします。プランと積み上げゲームは制作方針の例です。機能・ステージ数・数値設計・必要素材・納期は、合意した要件一覧と見積もりに基づきます。"],
    ["基本方案可升級進階方案，進階方案可升級豪華方案；追加費用與工期另行確認。", "Basic can be upgraded to Advanced, and Advanced to Deluxe. Additional costs and time are agreed separately.", "基本から上級へ、上級からデラックスへ変更できます。追加料金と納期は別途確認します。"],
    ["功能調整與 Bug 維護", "Feature revisions & bug fixes", "機能調整と不具合対応"],
    ["各方案交付前至少提供 3 包玩法／功能的新增或調整，每包內容與工作量於接案時確認。超出約定範圍，或於約定調整期限後提出的需求，另行報價。", "Every plan includes at least 3 sets of gameplay or feature additions or revisions before delivery. The content and workload of each set are agreed at the start. Requests beyond that scope or after the agreed revision period are quoted separately.", "各プランには、納品前の遊び・機能の追加または調整を3枠以上含みます。各枠の内容と作業量は受注時に確認します。合意した範囲外、または調整期限後のご要望は別途お見積もりします。"],
    ["需求追加與變更", "Additional or changed requirements", "要件の追加と変更"],
    ["超出原需求清單及約定調整包範圍的功能新增、規模擴充或方向變更，會先確認追加費用與工期，再安排製作。", "For new features, expanded scope, or a change of direction beyond the agreed requirements and revisions, additional cost and timing are confirmed before work proceeds.", "当初の要件一覧と調整枠を超える機能追加・規模拡張・方向変更は、追加料金と納期を確認したうえで制作します。"],
    ["交付後 1 個月 Bug 保固", "1-month bug warranty after delivery", "納品後1か月の不具合保証"],
    ["原約定功能的 Bug 修正不計入調整包數；交付後 1 個月內免費修正。新增功能、玩法大調整，以及平台更新造成的相容性修改，會另外告知並追加費用。", "Bug fixes for agreed features do not use revision sets and are free for 1 month after delivery. New features, major gameplay changes, and compatibility work caused by platform updates carry additional fees, discussed in advance.", "合意した機能の不具合修正は調整枠に数えず、納品後1か月以内は無料で対応します。機能追加・大幅な遊びの変更・プラットフォーム更新による互換性対応は、事前にご案内のうえ追加料金が発生します。"],
    ["美術、聲音與背景設定", "Artwork, audio & setting", "画像・音声・背景設定"],
    ["所有美術圖由委託方自備", "All artwork is supplied by the client", "すべての画像素材は依頼者様にてご用意ください"],
    ["動畫如需額外逐格圖片、圖層拆件或其他素材，會在開工前列出評估需求；製作中也可能新增美術需求。美術與 UI 設計可另洽阿言委託。", "If animation needs extra frames, separated layers, or other assets, I'll list the anticipated requirements before work begins. Further art needs may arise during development. Artwork and UI design can be commissioned from Ayan separately.", "アニメーション用のコマ画像・パーツ分け・その他の素材が必要な場合、制作開始前に想定要件をお伝えします。制作中に追加の画像素材が必要になることもあります。イラスト・UIデザインはアヤンへ別途依頼できます。"],
    ["音樂與音效", "Music & sound effects", "音楽と効果音"],
    ["基本方案不含音樂與音效。進階方案以免費素材的挑選、調整及整合為主。指定風格、原創作曲、錄音或其他客製聲音需求，會列入需求清單，另依製作範圍報價。豪華方案的客製音樂與音效，依需求確認製作方式與範圍。", "Basic excludes music and sound effects. Advanced focuses on selecting, adjusting, and integrating free assets. Requested styles, original compositions, recording, and other custom audio are listed in the requirements and quoted by scope. The production method and scope of Deluxe custom audio are agreed according to your needs.", "基本プランには音楽・効果音を含みません。上級プランは無料素材の選定・調整・組み込みが中心です。作風の指定・オリジナル作曲・録音などは要件に記載し、制作範囲に応じて別途見積もります。デラックスプランの音楽・効果音は、ご要望に応じて制作方法と範囲を確認します。"],
    ["世界觀與背景設定", "Worldbuilding & setting", "世界観と背景設定"],
    ["可由委託方提供，或由我依方案範圍協助設計。內容與篇幅於報價時確認，超出約定範圍另行報價；背景修改計入調整包數。", "You can provide the setting, or I can help design it within the plan's scope. Content and length are agreed at quoting. Work beyond the agreed scope is priced separately; setting revisions count toward the revision sets.", "依頼者様からご提供いただくか、プランの範囲内で設計をお手伝いします。内容と分量は見積もり時に確認し、範囲外は別途見積もります。背景設定の修正は調整枠に含みます。"],
    ["交付、訂金與尾款", "Delivery, deposit & balance", "納品・着手金・残金"],
    ["開工前付訂金", "Deposit before work begins", "制作開始前に着手金"],
    ["完成後付尾款", "Balance on completion", "完成後に残金"],
    ["收齊後提供遊戲檔案", "Game files after full payment", "全額入金確認後にデータ納品"],
    ["付款方式", "Payment arrangements", "お支払い方法"],
    ["開工前支付報價的 30% 作為訂金。開發期間以影片展示進度；遊戲完成並收到尾款後，交付遊戲檔案。分期等特殊付款需求，於接案前確認。", "A 30% deposit is due before work begins. Progress is shown through videos during development. Game files are delivered after completion and receipt of the balance. Installments or other special payment arrangements must be agreed before the commission starts.", "制作開始前に見積額の30%を着手金としてお支払いいただきます。開発中の進捗は動画で共有し、完成後、残金の入金を確認してゲームデータを納品します。分割払いなどの特別な条件は、受注前に確認します。"],
    ["交付內容", "Deliverables", "納品内容"],
    ["交付版本、支援的作業系統、裝置、瀏覽器、遊戲解析度，以及是否包含完整專案與原始碼，於接案時確認；效能優化也依約定的平台與測試範圍進行。", "The delivered version, supported operating systems, devices, browsers, resolution, and inclusion of the full project or source code are agreed at the start. Performance optimization follows the agreed platforms and testing scope.", "納品バージョン・対応OS・端末・ブラウザー・解像度・プロジェクト全体やソースコードの有無は受注時に確認します。動作最適化も、合意した環境と確認範囲に基づいて行います。"],
    ["取消委託與費用計算", "Cancellation & fee calculation", "キャンセルと料金計算"],
    ["於約定工期內取消委託，依完成度等比例計算違約金。完成度 0% 時收取報價的 30%；完成度 100% 時收取 70%，中間按比例計算。取消委託的開發成果會列入我的作品集。", "If a commission is cancelled within the agreed production period, the cancellation fee is proportional to completion: 30% of the quote at 0% completion and 70% at 100%, calculated proportionally in between. Work from cancelled commissions will be included in my portfolio.", "合意した制作期間内にキャンセルされた場合、進捗に応じてキャンセル料を比例計算します。進捗0%では見積額の30%、100%では70%となり、その間は比例計算です。キャンセルされた案件の制作成果はポートフォリオに掲載します。"],
    ["違約金＝委託報價 ×（30%＋40% × 遊戲完成度）", "Cancellation fee = Quote × (30% + 40% × Completion)", "キャンセル料＝見積額 ×（30%＋40% × 完成度）"],
    ["用你的報價，算算看。", "Try it with your quote.", "お見積額で計算してみる。"],
    ["委託報價（NT$）", "Commission quote (NT$)", "お見積額（NT$）"],
    ["遊戲完成度", "Game completion", "ゲームの完成度"],
    ["應收違約金", "Cancellation fee due", "キャンセル料"],
    ["（報價的 50%）", "(50% of the quote)", "（見積額の50%）"],
    ["以報價 NT$5,000 為例", "Example based on a NT$5,000 quote", "お見積額NT$5,000の場合"],
    ["完成度", "Completion", "完成度"],
    ["報價比例", "Share of quote", "見積額に対する割合"],
    ["違約金", "Cancellation fee", "キャンセル料"],
    ["原則上不承接 6 個月內曾主動取消委託的委託人。", "I generally do not accept new requests from clients who cancelled a commission within the past 6 months.", "過去6か月以内に依頼をキャンセルされた方からの再依頼は、原則お受けしません。"],
    ["工期、驗收與作品使用", "Schedule, acceptance & usage", "納期・検収・作品の利用"],
    ["工期與驗收", "Schedule & acceptance", "納期と検収"],
    ["請於 1 個月內完成驗收並支付尾款。開工條件、預估工期、驗收起算日及期限，於確認需求時約定。若素材延遲提供、需求變更或等待回覆影響製作，會再協調交期。", "Please complete acceptance and pay the balance within 1 month. Start conditions, estimated production time, and the start and end of the acceptance period are agreed with the requirements. Delayed assets, changed requirements, or time spent waiting for replies may require a revised deadline.", "1か月以内に検収と残金のお支払いをお願いします。着手条件・予定工期・検収の開始日と期限は、要件確認時に合意します。素材提供の遅れ・要件変更・返信待ちが制作に影響した場合は、納期を再調整します。"],
    ["作品使用與展示", "Usage rights & portfolio display", "作品の利用と公開"],
    ["成品的商用用途、專案與原始碼的使用及轉交範圍，以及是否可作為我的作品集展示，於接案時確認，依需求另議費用。", "Commercial use, use or transfer of the project and source code, and permission to display the work in my portfolio are agreed at the start. Fees are negotiated according to your needs.", "完成品の商用利用、プロジェクトやソースコードの利用・譲渡範囲、ポートフォリオへの掲載可否は受注時に確認し、ご要望に応じて料金を相談します。"],
    ["上架與帳號管理", "Publishing & account management", "公開とアカウント管理"],
    ["上架費用是否包含平台規費、商店頁面製作、審核修改與後續更新，於報價時確認。使用我的帳號上架時，會先約定託管期限及後續移轉方式；平台審核與商務洽談時程依實際情況安排。", "The quote specifies whether publishing includes platform fees, store-page creation, review-related revisions, and later updates. Publishing under my account requires agreement on hosting duration and transfer arrangements. Platform reviews and business discussions follow their actual timelines.", "公開料金にプラットフォーム料金・ストアページ作成・審査対応・公開後の更新を含むかは、見積もり時に確認します。私のアカウントで公開する場合は、管理期間と移管方法を事前に合意します。審査や商務交渉の日程は、実際の状況に応じて調整します。"],
    ["諮詢方式與服務範圍", "Consultation format & scope", "相談方法とサービス範囲"],
    ["初步委託洽談免費", "Free initial commission chat", "ご依頼前の相談は無料"],
    ["以文字確認遊戲類型、主要需求、預算及期望交期，初步確認是否承接及適合的方案。詳細玩法設計、技術評估與企劃討論，可另約深入諮詢。", "A text chat covers the game type, main needs, budget, and deadline to check availability and suggest a plan. Detailed gameplay design, technical assessment, and planning can be booked as an in-depth consultation.", "ゲームの種類・主なご要望・予算・希望納期をテキストで確認し、受付可否と適したプランをご案内します。詳しい遊びの設計・技術評価・企画相談は、別途ご予約ください。"],
    ["深入諮詢 NT$500／30 分鐘", "In-depth consultation: NT$500 / 30 min", "詳しいご相談：NT$500／30分"],
    ["遊戲想法、核心玩法與遊玩流程。", "Game ideas, core gameplay, and game flow.", "ゲームのアイデア・中心となる遊び・ゲームの流れ。"],
    ["參考遊戲的玩法拆解與重現方向。", "Analysis of reference games and how to recreate their mechanics.", "参考ゲームの遊びの分析と再現方針。"],
    ["關卡、數值、難度曲線與玩家引導。", "Levels, balancing, difficulty curves, and player guidance.", "ステージ・数値・難易度曲線・プレイヤーへのガイド。"],
    ["開發可行性、技術選擇與製作順序。", "Feasibility, technology choices, and development order.", "開発の実現性・技術選定・制作の順序。"],
    ["專案功能取捨、需求整理與製作範圍。", "Feature priorities, requirements, and project scope.", "機能の取捨選択・要件整理・制作範囲。"],
    ["目前開發遇到的問題，以及可能的處理方向。", "Current development problems and possible ways forward.", "現在の開発上の問題と、考えられる解決の方向性。"],
    ["預約與計費", "Booking & billing", "ご予約と料金"],
    ["請先提供想討論的問題、參考作品與相關資料。諮詢方式、時段與費用於預約時確認，以 30 分鐘為計費單位；如需延長，會先確認是否續談。", "Please send your questions, references, and relevant materials in advance. The format, time, and fee are agreed when booking. Billing is in 30-minute units, and any extension is confirmed before continuing.", "相談したい内容・参考作品・関連資料を事前にお送りください。方法・日時・料金は予約時に確認し、30分単位で計算します。延長する場合は、続けるかどうかを事前に確認します。"],
    ["大量文件、程式碼或專案的事前閱讀，會先確認評估範圍與費用。諮詢以討論、分析與方向建議為主；完整企劃文件、關卡製作、數值表、程式修改或實作，依需求另外報價。拒絕承接項目同樣適用於諮詢。", "The scope and fee for extensive advance review of documents, code, or projects are agreed first. Consultation focuses on discussion, analysis, and recommendations. Full design documents, level creation, balancing sheets, code changes, or implementation are quoted separately. Commission restrictions also apply to consultations.", "大量の文書・コード・プロジェクトの事前確認は、範囲と料金を先に合意します。相談は議論・分析・方向性の提案が中心です。企画書全体・ステージ制作・数値表・コード修正・実装は別途見積もります。受付制限は相談にも適用されます。"],
    ["承接限制與開發署名", "Restrictions & developer credit", "受付制限と開発者クレジット"],
    ["原則上不承接", "Generally not accepted", "原則お受けしないもの"],
    ["使用 AI 美術圖作為遊戲素材的委託。", "Games using AI-generated artwork.", "AI生成画像をゲーム素材として使用する依頼。"],
    ["學生作業。", "Student assignments.", "学校の課題。"],
    ["我主觀認定過於血腥、暴力、恐怖或令人產生生理不適的內容。", "Content I consider excessively gory, violent, frightening, or physically disturbing.", "私の判断で、過度に流血・暴力・恐怖・生理的な不快感を伴うと感じる内容。"],
    ["6 個月內曾主動取消委託的委託人。", "Clients who cancelled a commission within the past 6 months.", "過去6か月以内に依頼をキャンセルされた方。"],
    ["不接受的委託", "Not accepted", "お受けできない依頼"],
    ["阿言黑單人士的委託。", "Requests from people on Ayan's blacklist.", "アヤンのブラックリストに登録されている方からの依頼。"],
    ["要求隱藏我為遊戲開發者的委託。", "Requests to conceal my involvement as the game developer.", "私がゲーム開発者であることを非公開にするよう求める依頼。"],
    ["一起做出下一個好玩的想法。", "Let's build the next fun idea together.", "次の楽しいアイデアを、一緒に形に。"],
    ["玩玩蛇貂疊疊樂 ↗", "Play Snake Marten Stack ↗", "蛇貂積みゲームで遊ぶ ↗"],
    ["一起開始吧", "Let's get started", "一緒に始めましょう"],
    ["先把想法寫下來。", "Start with your idea.", "まずはアイデアを書こう。"],
    ["補上幾個重點，再複製到 Discord 私訊我。", "Fill in a few details, then copy your message into a Discord DM.", "いくつかの項目を埋めて、DiscordのDMにコピーしてください。"],
    ["想委託的方案", "Your preferred plan", "ご希望のプラン"],
    ["還不確定，想先聊聊", "Not sure yet, let's talk", "まだ未定、まずは相談したい"],
    ["委託訊息", "Your commission message", "依頼メッセージ"],
    ["複製訊息", "Copy message", "メッセージをコピー"],
    ["到 Discord 找我 ↗", "Find me on Discord ↗", "Discordで相談する ↗"],
    ["把你的想法做成可以玩的遊戲。浣熊拉芙提供遊戲開發、玩法與關卡設計，以及遊戲開發諮詢。基本方案 NT$2,000 起，進階方案 NT$5,000 起。", "Turn your idea into a playable game. Rafu offers game development, gameplay and level design, and development consulting. Basic plans from NT$2,000; Advanced from NT$5,000.", "アイデアを遊べるゲームに。浣熊ラフがゲーム開発・遊びやステージの設計・開発相談をお手伝いします。基本プランNT$2,000〜、上級プランNT$5,000〜。"],
    ["從第一個可玩版本，到更完整的遊戲。一起做出你的遊戲。", "From the first playable version to a fuller game. Let's make your game together.", "最初の遊べるバージョンから、より充実したゲームまで。一緒にあなたのゲームを作りましょう。"],
    ["浣熊拉芙，回到頁首", "Rafu, back to top", "浣熊ラフ、ページ上部へ"],
    ["開啟導覽選單", "Open navigation menu", "ナビゲーションを開く"],
    ["關閉導覽選單", "Close navigation menu", "ナビゲーションを閉じる"],
    ["主要導覽", "Main navigation", "メインナビゲーション"],
    ["疊疊樂玩法插圖示意", "Illustration of the stacking game", "積み上げゲームのイメージ"],
    ["更換球球組合", "Remix the spheres", "球の組み合わせを変える"],
    ["疊疊樂方案範例", "Stacking-game plan examples", "積み上げゲームのプラン別制作例"],
    ["阿言頭像", "Ayan's avatar", "アヤンのアイコン"],
    ["關閉委託訊息", "Close commission message", "依頼メッセージを閉じる"],
    ["選擇語言", "Choose language", "言語を選択"],
    ["（報價的 {rate}%）", "({rate}% of the quote)", "（見積額の{rate}%）"],
    ["請輸入有效報價", "Enter a valid quote", "有効なお見積額を入力してください"],
    ["Hi，浣熊拉芙，我想聊聊遊戲委託！", "Hi Rafu, I'd like to talk about a game commission!", "こんにちは、浣熊ラフさん。ゲーム制作について相談したいです！"],
    ["委託方案：", "Commission plan: ", "ご希望のプラン："],
    ["遊戲想法／參考作品：", "Game idea / references: ", "ゲームのアイデア／参考作品："],
    ["預算範圍：", "Budget range: ", "予算の範囲："],
    ["期望完成時間：", "Preferred deadline: ", "希望納期："],
    ["目前準備好的美術素材：", "Artwork currently available: ", "現在用意できている画像素材："],
    ["其他想討論的內容：", "Other things to discuss: ", "その他の相談内容："],
    ["複製好了，到 Discord 貼上就可以。", "Copied! Paste your message into Discord.", "コピーしました。Discordに貼り付けてください。"],
    ["已選取訊息，請手動複製後貼到 Discord。", "Message selected. Copy it manually and paste it into Discord.", "メッセージを選択しました。手動でコピーし、Discordに貼り付けてください。"]
  ];

  const translations = new Map(copy.map(([zh, en, ja]) => [zh, { zh, en, ja }]));
  const locales = {
    zh: { html: 'zh-Hant', format: 'zh-TW', og: 'zh_TW' },
    en: { html: 'en', format: 'en-US', og: 'en_US' },
    ja: { html: 'ja', format: 'ja-JP', og: 'ja_JP' }
  };
  const storageKey = 'taillabs-commission-language';
  let language = 'zh';

  function t(source, values = {}) {
    const translated = translations.get(source)?.[language] ?? source;
    return translated.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
  }

  // Keep option values stable for the existing commission form.
  document.querySelectorAll('#brief-plan option').forEach((option) => {
    if (!option.hasAttribute('value')) option.value = option.textContent;
  });

  // Retain actual text-node references so translating never recreates artwork,
  // buttons, inputs, event handlers, or the visitor's typed message.
  const textEntries = [];
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script, style')) continue;
    const original = node.nodeValue;
    const key = original.trim();
    if (translations.has(key)) textEntries.push({ node, original, key });
  }
  const attributeEntries = [];
  document.querySelectorAll('[aria-label], [alt], [title], meta[content]').forEach((element) => {
    ['aria-label', 'alt', 'title', 'content'].forEach((attribute) => {
      const key = element.getAttribute(attribute);
      if (translations.has(key)) attributeEntries.push({ element, attribute, key });
    });
  });

  function setLanguage(nextLanguage, remember = true) {
    if (!Object.hasOwn(locales, nextLanguage)) return;
    language = nextLanguage;
    document.documentElement.lang = locales[language].html;
    textEntries.forEach(({ node: textNode, original, key }) => {
      if (textNode.isConnected) textNode.nodeValue = original.replace(key, t(key));
    });
    attributeEntries.forEach(({ element, attribute, key }) => element.setAttribute(attribute, t(key)));
    document.querySelector('meta[property="og:locale"]').content = locales[language].og;
    document.querySelectorAll('[data-language]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.language === language));
    });
    if (remember) {
      try { localStorage.setItem(storageKey, language); } catch { /* Storage may be unavailable. */ }
      const currentUrl = new URL(location.href);
      if (currentUrl.searchParams.has('lang')) {
        currentUrl.searchParams.set('lang', language);
        history.replaceState(null, '', currentUrl);
      }
    }
    window.dispatchEvent(new CustomEvent('commission-languagechange', { detail: { language } }));
  }

  window.commissionI18n = Object.freeze({
    t,
    setLanguage,
    get language() { return language; },
    get locale() { return locales[language].format; }
  });
  document.querySelectorAll('[data-language]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.language));
  });
  let initialLanguage = 'zh';
  try { initialLanguage = localStorage.getItem(storageKey) || 'zh'; } catch { /* Use Chinese by default. */ }
  const requestedLanguage = new URL(location.href).searchParams.get('lang');
  if (Object.hasOwn(locales, requestedLanguage)) initialLanguage = requestedLanguage;
  setLanguage(Object.hasOwn(locales, initialLanguage) ? initialLanguage : 'zh', false);
})();
