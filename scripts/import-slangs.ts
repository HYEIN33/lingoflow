/**
 * 批量导入词条
 * 运行: npx tsx scripts/import-slangs.ts
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

// =============================================
// 在这里粘贴词条
// =============================================
const DATA = [
  {
    "term": "落灰神器",
    "meaning": "生活闲置梗，小红书、抖音流行，指当初头脑发热买回家，之后就一直放着积灰、再也没用过的东西。",
    "example": "这个跑步机就是个落灰神器，买了之后就跑了两次。",
    "sentiment": "调侃"
  },
  {
    "term": "梦想积灰",
    "meaning": "人生自嘲梗，微博、豆瓣流行，指曾经的理想、梦想，被现实搁置，慢慢蒙尘再也没碰过。",
    "example": "我当年想当画家，现在画笔都放着梦想积灰了。",
    "sentiment": "调侃"
  },
  {
    "term": "爆肝续命",
    "meaning": "熬夜梗，B站、抖音流行，指熬夜刷手机、玩游戏，用透支身体的方式，换取一点属于自己的自由时间。",
    "example": "每天下班都爆肝续命，不然感觉一天都没自己的时间。",
    "sentiment": "调侃"
  },
  {
    "term": "氪金纯爱",
    "meaning": "情感梗，游戏圈、小红书流行，指花钱去追虚拟的、理想中的爱情，比如养虚拟男友、抽恋爱卡。",
    "example": "我在乙女游戏里氪金纯爱，比现实恋爱还投入。",
    "sentiment": "调侃"
  },
  {
    "term": "孤勇纯爱",
    "meaning": "情感梗，微博、抖音流行，指不将就、宁缺毋滥，哪怕一个人很久，也坚持要纯粹的爱情。",
    "example": "我30了还没谈恋爱，就是想孤勇纯爱，不凑活。",
    "sentiment": "中性"
  },
  {
    "term": "零感菇",
    "meaning": "创作梗，B站、小红书流行，谐音“灵感菇”，指创作者没灵感、摆烂、写不出东西的状态。",
    "example": "这周写文案完全零感菇，一个字都憋不出来。",
    "sentiment": "调侃"
  },
  {
    "term": "圆头XX",
    "meaning": "萌化梗，抖音、小红书流行，指把任何东西都做成圆润可爱的版本，比如圆头奥特曼、圆头恐龙。",
    "example": "这个圆头奥特曼也太可爱了，完全没有攻击性。",
    "sentiment": "褒义"
  },
  {
    "term": "埃及摇",
    "meaning": "舞蹈梗，抖音、快手流行，指一种魔性的复古土味舞蹈，动作简单洗脑，非常有喜感。",
    "example": "最近这个埃及摇太火了，我也跟着学了一下。",
    "sentiment": "调侃"
  },
  {
    "term": "秦始皇骑北极熊",
    "meaning": "整活梗，B站、抖音流行，指历史乱炖、毫无逻辑的抽象二创，把完全不搭的东西凑一起。",
    "example": "这个视频居然做了秦始皇骑北极熊，太离谱了。",
    "sentiment": "调侃"
  },
  {
    "term": "甲亢哥",
    "meaning": "网红梗，抖音、快手流行，指那种亢奋到夸张、语速超快、情绪拉满的博主或路人。",
    "example": "那个甲亢哥说话也太快了，我根本跟不上。",
    "sentiment": "调侃"
  },
  {
    "term": "外卖三国杀",
    "meaning": "行业梗，微博、抖音流行，指外卖平台之间的内卷大战，各种补贴、抢商家，像三国杀一样。",
    "example": "最近外卖三国杀，补贴超多，吃饭都便宜了。",
    "sentiment": "中性"
  },
  {
    "term": "想你的风别吹了",
    "meaning": "反矫情梗，抖音、小红书流行，吐槽土味情话、网红路牌腻了，别再搞这种矫情的东西了。",
    "example": "到处都是想你的风，能不能想你的风别吹了。",
    "sentiment": "调侃"
  },
  {
    "term": "你俩本可以直接打架的",
    "meaning": "劝架梗，微博、抖音流行，吐槽两个人吵架还在演、阴阳怪气，不如直接动手算了。",
    "example": "你俩吵来吵去的，你俩本可以直接打架的。",
    "sentiment": "调侃"
  },
  {
    "term": "电子骨灰盒",
    "meaning": "数字遗产梗，知乎、B站流行，指存放自己数字遗产的账号，死后把账号、数据留给别人。",
    "example": "我准备弄个电子骨灰盒，把我所有账号都存进去。",
    "sentiment": "中性"
  },
  {
    "term": "摸鱼KPI",
    "meaning": "职场梗，脉脉、抖音流行，指每天上班给自己定的摸鱼任务，比如必须刷够多久手机。",
    "example": "我的摸鱼KPI是每天下午必须刷半小时抖音。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪拉屎",
    "meaning": "摸鱼梗，职场社区、抖音爆火，指利用上班时间上厕所，带薪摸鱼，最划算的摸鱼方式。",
    "example": "我每天带薪拉屎半小时，相当于每天多赚半小时工资。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪喝水",
    "meaning": "摸鱼梗，职场圈、小红书流行，指利用上班时间喝水、起身活动，顺便摸鱼休息。",
    "example": "我隔一小时就带薪喝水，活动一下身体。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪发呆",
    "meaning": "摸鱼梗，职场圈、抖音流行，指上班时间放空自己、发呆，不用干活，带薪休息。",
    "example": "今天没什么事，我带薪发呆了一上午。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪刷手机",
    "meaning": "摸鱼梗，职场圈、小红书流行，指上班时间刷手机、看视频，带薪摸鱼。",
    "example": "领导不在，我就带薪刷手机，摸鱼摸鱼。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪聊天",
    "meaning": "摸鱼梗，职场圈、抖音流行，指上班时间跟同事聊天，带薪社交摸鱼。",
    "example": "我们俩带薪聊天，聊了一上午八卦。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪学习",
    "meaning": "摸鱼梗，职场圈、脉脉流行，指利用上班时间学习自己的东西，提升自己，带薪摸鱼。",
    "example": "上班没事做，我就带薪学习，准备考证。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪追剧",
    "meaning": "摸鱼梗，职场圈、抖音流行，指上班时间偷偷追剧，带薪摸鱼，高级摸鱼技巧。",
    "example": "我上班摸鱼带薪追剧，把更新的剧都看完了。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪打游戏",
    "meaning": "摸鱼梗，职场圈、B站流行，指上班时间偷偷打游戏，顶级摸鱼技巧。",
    "example": "他上班居然带薪打游戏，胆子也太大了。",
    "sentiment": "调侃"
  },
  {
    "term": "带薪睡觉",
    "meaning": "摸鱼梗，职场圈、抖音流行，指上班时间偷偷睡觉，终极摸鱼技巧。",
    "example": "昨天熬夜，今天上班带薪睡觉，补了一觉。",
    "sentiment": "调侃"
  },
  {
    "term": "摸鱼式加班",
    "meaning": "加班梗，职场圈、脉脉流行，指上班的时候摸鱼，下班了假装加班，显得自己很努力。",
    "example": "他天天摸鱼式加班，上班不干活，下班装忙。",
    "sentiment": "贬义"
  },
  {
    "term": "表演式加班",
    "meaning": "加班梗，职场圈、微博流行，指为了让领导看到，故意加班，表演自己很努力。",
    "example": "领导在就表演式加班，领导一走就立马走。",
    "sentiment": "贬义"
  },
  {
    "term": "无效加班",
    "meaning": "加班梗，职场圈、知乎流行，指加班了也没产出，没干活，白加了。",
    "example": "天天无效加班，坐在那耗时间，啥也没干。",
    "sentiment": "贬义"
  },
  {
    "term": "形式主义加班",
    "meaning": "加班梗，职场圈、抖音流行，指为了加班而加班，不管有没有事，都要熬到点。",
    "example": "我们公司就是形式主义加班，不管忙不忙都要到九点。",
    "sentiment": "贬义"
  },
  {
    "term": "被迫加班",
    "meaning": "加班梗，职场圈、脉脉流行，指被领导要求，不得不加班，不是自愿的。",
    "example": "今天又被迫加班，本来约了朋友吃饭。",
    "sentiment": "贬义"
  },
  {
    "term": "自愿加班",
    "meaning": "加班梗，职场圈、知乎流行，指为了完成工作，自己主动加班，没人逼你。",
    "example": "这个项目赶进度，我自愿加班把它做完。",
    "sentiment": "中性"
  },
  {
    "term": "无偿加班",
    "meaning": "加班梗，职场圈、微博流行，指没有加班费的加班，白干活。",
    "example": "我们公司天天无偿加班，一分钱都没有。",
    "sentiment": "贬义"
  },
  {
    "term": "有偿加班",
    "meaning": "加班梗，职场圈、脉脉流行，指有加班费的加班，加班有报酬。",
    "example": "周末有偿加班，双倍工资，我就去了。",
    "sentiment": "中性"
  },
  {
    "term": "调休加班",
    "meaning": "加班梗，职场圈、抖音流行，指加班之后用调休代替加班费，不用给钱。",
    "example": "国庆加班，公司不给钱，只给调休加班。",
    "sentiment": "中性"
  },
  {
    "term": "周末加班",
    "meaning": "加班梗，职场圈、小红书流行，指周末被要求来公司加班，占用休息时间。",
    "example": "这个周末又要周末加班，本来想出去玩的。",
    "sentiment": "贬义"
  },
  {
    "term": "节假日加班",
    "meaning": "加班梗，职场圈、微博流行，指节假日被要求加班，不能放假。",
    "example": "节假日加班三倍工资，我还是愿意的。",
    "sentiment": "中性"
  },
  {
    "term": "深夜加班",
    "meaning": "加班梗，职场圈、抖音流行，指加班到深夜，很晚才下班。",
    "example": "今天又深夜加班，到家都十二点了。",
    "sentiment": "贬义"
  },
  {
    "term": "凌晨加班",
    "meaning": "加班梗，职场圈、脉脉流行，指加班到凌晨，通宵干活。",
    "example": "项目上线，我们凌晨加班，熬了一整夜。",
    "sentiment": "贬义"
  },
  {
    "term": "通宵加班",
    "meaning": "加班梗，职场圈、微博流行，指加班一整晚，没睡觉，第二天继续上班。",
    "example": "为了赶方案，我们通宵加班，终于做完了。",
    "sentiment": "贬义"
  },
  {
    "term": "连续加班",
    "meaning": "加班梗，职场圈、抖音流行，指连续好几天都加班，没有休息。",
    "example": "连续加班一周，我感觉身体都快垮了。",
    "sentiment": "贬义"
  },
  {
    "term": "宅家养老",
    "meaning": "生活梗，小红书、豆瓣流行，指在家过着养老一样的生活，不上班不社交，很悠闲。",
    "example": "我辞职之后宅家养老，每天养花看书，太舒服了。",
    "sentiment": "中性"
  },
  {
    "term": "躺平式养生",
    "meaning": "养生梗，抖音、小红书流行，指一边熬夜躺平，一边养生，矛盾的生活方式。",
    "example": "我就是躺平式养生，一边熬夜一边泡枸杞。",
    "sentiment": "调侃"
  },
  {
    "term": "朋克养生",
    "meaning": "养生梗，微博、抖音爆火，指一边作死熬夜，一边养生，比如喝啤酒泡枸杞。",
    "example": "年轻人的朋克养生，一边熬夜一边敷面膜。",
    "sentiment": "调侃"
  },
  {
    "term": "佛系养生",
    "meaning": "养生梗，小红书、豆瓣流行，指随缘养生，不刻意，想起来就养，想不起来就算。",
    "example": "我佛系养生，想起来就喝杯水，想不起来就算了。",
    "sentiment": "中性"
  },
  {
    "term": "精致养生",
    "meaning": "养生梗，小红书、抖音流行，指非常讲究的养生，各种保健品、仪器，很精致。",
    "example": "她的精致养生，每天各种保健品，还有按摩仪。",
    "sentiment": "中性"
  },
  {
    "term": "懒人养生",
    "meaning": "养生梗，抖音、小红书流行，指适合懒人的养生，不用动，躺着就能养生。",
    "example": "懒人养生，躺着泡脚，不用动。",
    "sentiment": "调侃"
  },
  {
    "term": "熬夜冠军",
    "meaning": "熬夜梗，微博、抖音流行，指熬夜最厉害的人，每天熬到最晚。",
    "example": "我们群里的熬夜冠军，每天三点才睡。",
    "sentiment": "调侃"
  },
  {
    "term": "熬夜达人",
    "meaning": "熬夜梗，小红书、抖音流行，指经常熬夜，很擅长熬夜的人。",
    "example": "我是熬夜达人，熬到两点都不困。",
    "sentiment": "调侃"
  },
  {
    "term": "熬夜选手",
    "meaning": "熬夜梗，微博、抖音流行，指参与熬夜的人，熬夜大军的一员。",
    "example": "有没有熬夜选手，出来聊聊天。",
    "sentiment": "调侃"
  },
  {
    "term": "熬夜党",
    "meaning": "熬夜梗，B站、抖音流行，指喜欢熬夜的群体，每天都很晚睡。",
    "example": "熬夜党表示，晚上才是自己的时间。",
    "sentiment": "调侃"
  },
  {
    "term": "夜猫子",
    "meaning": "熬夜梗，生活圈、抖音流行，指晚上不睡觉，很精神，白天犯困的人。",
    "example": "我就是个夜猫子，晚上精神，白天起不来。",
    "sentiment": "中性"
  },
  {
    "term": "早起困难户",
    "meaning": "起床梗，小红书、抖音流行，指早上很难起床，起不来的人。",
    "example": "我是早起困难户，每天闹钟响十遍才起。",
    "sentiment": "调侃"
  },
  {
    "term": "起床困难户",
    "meaning": "起床梗，微博、抖音流行，跟早起困难户差不多，起床非常困难，赖床。",
    "example": "冬天的起床困难户，根本不想离开被窝。",
    "sentiment": "调侃"
  },
  {
    "term": "赖床达人",
    "meaning": "赖床梗，小红书、抖音流行，指非常擅长赖床，能赖很久的人。",
    "example": "赖床达人，能在床上赖到中午。",
    "sentiment": "调侃"
  },
  {
    "term": "赖床冠军",
    "meaning": "赖床梗，微博、抖音流行，指赖床最厉害的人，赖的时间最长。",
    "example": "我们家的赖床冠军，周末能赖到下午。",
    "sentiment": "调侃"
  },
  {
    "term": "赖床选手",
    "meaning": "赖床梗，抖音、小红书流行，指参与赖床的人，赖床大军的一员。",
    "example": "有没有赖床选手，举个手。",
    "sentiment": "调侃"
  },
  {
    "term": "干饭人",
    "meaning": "干饭梗，抖音、微博爆火，指非常喜欢吃饭，吃饭很积极的人。",
    "example": "干饭人干饭魂，干饭都是人上人。",
    "sentiment": "调侃"
  },
  {
    "term": "干饭魂",
    "meaning": "干饭梗，抖音、小红书流行，指干饭人的精神，吃饭的执念。",
    "example": "干饭魂，我这辈子就是为了吃饭。",
    "sentiment": "调侃"
  },
  {
    "term": "干饭王",
    "meaning": "干饭梗，微博、抖音流行，指干饭最厉害的人，吃的最多最快。",
    "example": "他是我们公司的干饭王，每次都第一个到食堂。",
    "sentiment": "调侃"
  },
  {
    "term": "干饭达人",
    "meaning": "干饭梗，小红书、抖音流行，指很会干饭，很喜欢吃饭的人。",
    "example": "我是干饭达人，哪里有好吃的我都知道。",
    "sentiment": "中性"
  },
  {
    "term": "干饭选手",
    "meaning": "干饭梗，微博、抖音流行，指参与干饭的人，干饭大军的一员。",
    "example": "有没有干饭选手，晚上一起去吃火锅。",
    "sentiment": "中性"
  },
  {
    "term": "吃货",
    "meaning": "美食梗，生活圈、抖音流行，指非常喜欢吃，爱吃东西的人。",
    "example": "我是个吃货，就喜欢到处吃好吃的。",
    "sentiment": "中性"
  },
  {
    "term": "美食家",
    "meaning": "美食梗，小红书、抖音流行，指很懂美食，会吃会评的人。",
    "example": "他是个美食家，吃一口就知道食材好不好。",
    "sentiment": "褒义"
  },
  {
    "term": "探店达人",
    "meaning": "美食梗，抖音、小红书流行，指喜欢去探店，打卡各种新店的人。",
    "example": "探店达人每周都去打卡新店，太会吃了。",
    "sentiment": "中性"
  },
  {
    "term": "美食博主",
    "meaning": "博主梗，抖音、小红书流行，指分享美食、探店的博主。",
    "example": "我关注了好多美食博主，跟着他们找好吃的。",
    "sentiment": "中性"
  },
  {
    "term": "吃播博主",
    "meaning": "博主梗，B站、抖音流行，指直播吃饭、吃美食的博主。",
    "example": "我晚上喜欢看吃播博主，下饭。",
    "sentiment": "中性"
  },
  {
    "term": "社恐",
    "meaning": "社交梗，微博、抖音爆火，指社交恐惧症，害怕社交，怕跟人打交道。",
    "example": "我社恐，人多的地方就紧张。",
    "sentiment": "中性"
  },
  {
    "term": "社牛",
    "meaning": "社交梗，抖音、小红书爆火，指社交牛逼症，跟谁都能聊，不怕社交。",
    "example": "我朋友是社牛，跟陌生人都能聊半小时。",
    "sentiment": "调侃"
  },
  {
    "term": "社杂",
    "meaning": "社交梗，微博、抖音流行，指社交牛杂症，有时候社恐有时候社牛，看情况。",
    "example": "我是社杂，熟了就社牛，不熟就社恐。",
    "sentiment": "中性"
  },
  {
    "term": "社死现场",
    "meaning": "社死梗，抖音、小红书流行，指社会性死亡的现场，非常尴尬的时刻。",
    "example": "我在公司群里发了错的文件，大型社死现场。",
    "sentiment": "调侃"
  },
  {
    "term": "社死瞬间",
    "meaning": "社死梗，微博、抖音流行，指发生社死的那个瞬间，尴尬到抠脚。",
    "example": "认错人跟人打招呼，那个社死瞬间我能记一辈子。",
    "sentiment": "调侃"
  },
  {
    "term": "社死名场面",
    "meaning": "社死梗，B站、抖音流行，指经典的、很有名的社死场面。",
    "example": "那个在婚礼上放错视频的，就是社死名场面。",
    "sentiment": "调侃"
  },
  {
    "term": "社交牛逼症",
    "meaning": "社交梗，抖音、微博爆火，指在社交方面非常厉害，不怕生，跟谁都能聊。",
    "example": "他有社交牛逼症，在火车上跟对面的人聊了一路。",
    "sentiment": "调侃"
  },
  {
    "term": "社交牛杂症",
    "meaning": "社交梗，小红书、抖音流行，指介于社恐和社牛之间，有时候怕有时候不怕。",
    "example": "我是社交牛杂症，跟朋友在一起就社牛，跟陌生人就社恐。",
    "sentiment": "中性"
  },
  {
    "term": "社交恐惧症",
    "meaning": "社交梗，微博、知乎流行，指害怕社交，跟人打交道就紧张的症状。",
    "example": "我有社交恐惧症，不敢跟陌生人说话。",
    "sentiment": "中性"
  },
  {
    "term": "社交焦虑症",
    "meaning": "社交梗，知乎、小红书流行，指社交的时候会感到焦虑、紧张的症状。",
    "example": "我有社交焦虑症，每次聚会都提前焦虑好久。",
    "sentiment": "中性"
  },
  {
    "term": "社交障碍",
    "meaning": "社交梗，微博、抖音流行，指有社交方面的障碍，不会跟人打交道。",
    "example": "他有点社交障碍，不太会跟人聊天。",
    "sentiment": "中性"
  },
  {
    "term": "社交达人",
    "meaning": "社交梗，小红书、抖音流行，指非常擅长社交，很会跟人打交道的人。",
    "example": "他是社交达人，认识好多人，人脉超广。",
    "sentiment": "褒义"
  },
  {
    "term": "社交能手",
    "meaning": "社交梗，微博、知乎流行，指社交能力很强，很会处理人际关系的人。",
    "example": "他是社交能手，什么人都能搞定。",
    "sentiment": "褒义"
  },
  {
    "term": "社交高手",
    "meaning": "社交梗，抖音、小红书流行，指社交技巧很高，很会跟人打交道的人。",
    "example": "他是社交高手，跟谁都能处好关系。",
    "sentiment": "褒义"
  },
  {
    "term": "社交小白",
    "meaning": "社交梗，微博、抖音流行，指不擅长社交，什么都不懂的社交新手。",
    "example": "我是社交小白，不太会跟人打交道。",
    "sentiment": "中性"
  },
  {
    "term": "社交新人",
    "meaning": "社交梗，小红书、知乎流行，指刚开始社交，不太懂的新手。",
    "example": "我刚入职场，还是个社交新人。",
    "sentiment": "中性"
  },
  {
    "term": "饭圈女孩",
    "meaning": "追星梗，微博、抖音流行，指追星的女孩，为偶像打榜应援的粉丝。",
    "example": "饭圈女孩为了偶像，真的很拼。",
    "sentiment": "中性"
  },
  {
    "term": "饭圈男孩",
    "meaning": "追星梗，微博、B站流行，指追星的男孩，喜欢偶像的男粉丝。",
    "example": "饭圈男孩也很厉害，做数据比女孩还厉害。",
    "sentiment": "中性"
  },
  {
    "term": "饭圈文化",
    "meaning": "追星梗，知乎、微博流行，指追星形成的文化，有自己的用语、规则。",
    "example": "饭圈文化我不太懂，好多黑话我都听不懂。",
    "sentiment": "中性"
  },
  {
    "term": "饭圈用语",
    "meaning": "追星梗，微博、小红书流行，指饭圈内部使用的特殊用语，外人听不懂。",
    "example": "这些饭圈用语我都看不懂，太复杂了。",
    "sentiment": "中性"
  },
  {
    "term": "饭圈黑话",
    "meaning": "追星梗，抖音、微博流行，指饭圈内部的黑话，只有粉丝才懂的话。",
    "example": "他们说的饭圈黑话，我一句都听不懂。",
    "sentiment": "中性"
  },
  {
    "term": "打榜",
    "meaning": "追星梗，微博、抖音流行，指为偶像打榜投票，冲排名的行为。",
    "example": "粉丝们天天给偶像打榜，就为了让他上第一。",
    "sentiment": "中性"
  },
  {
    "term": "应援",
    "meaning": "追星梗，微博、小红书流行，指为偶像加油助威，买应援物、举灯牌。",
    "example": "演唱会现场，粉丝们的应援超燃。",
    "sentiment": "中性"
  },
  {
    "term": "控评",
    "meaning": "追星梗，微博、抖音流行，指控制评论区，把好评顶上去，压下差评。",
    "example": "偶像一有新闻，粉丝就开始控评。",
    "sentiment": "中性"
  },
  {
    "term": "反黑",
    "meaning": "追星梗，微博、B站流行，指反对黑粉，举报黑偶像的言论。",
    "example": "粉丝们每天都在反黑，举报那些骂偶像的人。",
    "sentiment": "中性"
  },
  {
    "term": "净化",
    "meaning": "追星梗，微博、小红书流行，指净化搜索结果，把黑料压下去。",
    "example": "粉丝们每天都在净化，把不好的内容压下去。",
    "sentiment": "中性"
  },
  {
    "term": "数据女工",
    "meaning": "追星梗，微博、抖音流行，指为偶像做数据的女生，天天做数据。",
    "example": "数据女工每天都在做数据，为了偶像的排名。",
    "sentiment": "中性"
  },
  {
    "term": "数据男工",
    "meaning": "追星梗，微博、B站流行，指为偶像做数据的男生，帮偶像冲数据。",
    "example": "数据男工也很拼，熬夜做数据。",
    "sentiment": "中性"
  },
  {
    "term": "氪金",
    "meaning": "追星/游戏梗，微博、抖音流行，指为偶像/游戏花钱，充钱。",
    "example": "我为了偶像的专辑，氪金买了十张。",
    "sentiment": "中性"
  },
  {
    "term": "白嫖",
    "meaning": "追星/游戏梗，微博、B站流行，指不为偶像/游戏花钱，只享受内容。",
    "example": "我就是白嫖，只看视频不花钱。",
    "sentiment": "中性"
  },
  {
    "term": "路人粉",
    "meaning": "追星梗，微博、小红书流行，指对偶像有好感，但不深入了解的粉丝。",
    "example": "我是他的路人粉，觉得他挺帅的。",
    "sentiment": "中性"
  },
  {
    "term": "死忠粉",
    "meaning": "追星梗，微博、抖音流行，指非常忠诚的粉丝，不管怎么样都支持偶像。",
    "example": "死忠粉不管偶像出什么事，都一直支持他。",
    "sentiment": "中性"
  },
  {
    "term": "唯粉",
    "meaning": "追星梗，微博、B站流行，指只喜欢一个偶像的粉丝，只支持他一个。",
    "example": "我是唯粉，只喜欢他一个，不喜欢团里其他人。",
    "sentiment": "中性"
  },
  {
    "term": "团粉",
    "meaning": "追星梗，微博、小红书流行，指喜欢整个团体的粉丝，支持所有人。",
    "example": "我是团粉，团里的每个人我都喜欢。",
    "sentiment": "中性"
  },
  {
    "term": "CP粉",
    "meaning": "追星梗，微博、抖音流行，指喜欢偶像CP的粉丝，磕两个人的爱情。",
    "example": "我是CP粉，磕他们俩的糖。",
    "sentiment": "中性"
  },
  {
    "term": "黑粉",
    "meaning": "追星梗，微博、抖音流行，指讨厌偶像，黑他的人。",
    "example": "黑粉天天骂偶像，太过分了。",
    "sentiment": "贬义"
  }
];

async function main() {
  const cred = await signInAnonymously(auth);
  const uid = cred.user.uid;
  let ok = 0, skip = 0;

  for (const { term, meaning, example } of DATA) {
    try {
      const exists = await getDocs(query(collection(db, 'slangs'), where('term', '==', term)));
      let id: string;

      if (!exists.empty) {
        id = exists.docs[0].id;
        console.log(`跳过 "${term}"（已存在）`);
        skip++;
        continue;
      } else {
        console.log(`创建 "${term}"...`);
        const ref = await addDoc(collection(db, 'slangs'), { term, createdAt: serverTimestamp() });
        id = ref.id;
        console.log(`  slangs OK, id=${id}`);
      }

      console.log(`  写入 meaning...`);
      await addDoc(collection(db, 'slang_meanings'), {
        slangId: id, meaning, example,
        authorId: uid, authorName: 'LingoFlow Bot',
        qualityScore: 85, upvotes: 0, status: 'approved',
        voiceName: 'Kore',
        createdAt: serverTimestamp(),
      });

      ok++;
      console.log(`导入 "${term}"`);
    } catch (e: any) {
      console.error(`失败 "${term}": ${e.code} ${e.message}`);
    }
  }

  console.log(`\n完成！新增 ${ok}，跳过 ${skip}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
