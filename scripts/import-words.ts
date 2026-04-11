/**
 * 批量导入生词到复习本
 * 运行: npx tsx scripts/import-words.ts
 */
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getAuth, signInAnonymously } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

// =============================================
// 在这里粘贴生词，格式：
// { word: "单词", meaning: "中文意思", example: "例句", exampleZh: "例句翻译" },
// =============================================
const DATA = [
  { word: "resilient", meaning: "有韧性的，能恢复的", example: "She is incredibly resilient.", exampleZh: "她非常有韧性。" },
  // 继续粘贴...
];

async function main() {
  const cred = await signInAnonymously(auth);
  const uid = cred.user.uid;
  let ok = 0, skip = 0;

  for (const { word, meaning, example, exampleZh } of DATA) {
    // 检查是否已存在
    const exists = await getDocs(query(collection(db, 'words'), where('original', '==', word), where('userId', '==', uid)));
    if (!exists.empty) {
      console.log(`跳过 "${word}"（已存在）`);
      skip++;
      continue;
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + 1); // 明天开始复习

    await addDoc(collection(db, 'words'), {
      original: word,
      userId: uid,
      usages: [{
        label: "Primary",
        labelZh: "常用",
        meaning: meaning,
        meaningZh: meaning,
        examples: [{ sentence: example, translation: exampleZh }],
      }],
      styleTag: 'standard',
      nextReviewDate: Timestamp.fromDate(nextReview),
      interval: 0,
      easeFactor: 2.5,
      createdAt: serverTimestamp(),
    });

    ok++;
    console.log(`导入 "${word}"`);
  }

  console.log(`\n完成！新增 ${ok}，跳过 ${skip}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
