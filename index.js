// // @ts-check
/* ---------- define type. ---------- */
/**
 * @typedef {object} YoutubeLive
 * @property {number} count 同時視聴者数
 * @property {object} rate 評価
 * @property {number} rate.high 高評価数
 * @property {number} rate.low 低評価数
 * @property {string} state 配信状態
 * @property {string} title タイトル
 * @property {number} time 取得時間
 */

/* ---------- require. ---------- */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

/* ---------- config. ---------- */
const executablePath =
  'C:\\Program Files (x86)\\Google\\Chrome Beta\\Application\\chrome.exe';
let url = 'https://www.youtube.com/watch?v=okGKwpCJ6m4';
// 実行時引数からURLを設定する.
if (process.argv.length >= 3) {
  const arg = process.argv[2];
  if (arg.indexOf('https://www.youtube.com/') === 0) {
    url = arg;
  }
}
const logName =
  url.replace(/https:\/\/www\.youtube\.com\/watch\?v=/, '') + '.txt';

/* ---------- define function. ---------- */

const func = {
  filename: 'log/' + logName,

  appendLog: (log) => {
    try {
      fs.appendFileSync(path.join(__dirname, func.filename), log + '\n');
    } catch (error) {
      console.log('err:', error);
    }
  },
  writeLog: (log) => {
    try {
      fs.writeFileSync(path.join(__dirname, func.filename), log);
    } catch (error) {
      console.log('err:', error);
    }
  },

  /**
   * 0 ~ max の乱数
   * @param {number} max
   * @return {number}
   */
  rnd: (max) => {
    return Math.floor(Math.random() * Math.floor(max));
  },
  /**
   * スクリーンショット.
   * @param {Page} page
   * @param {string} path
   */
  ss: async (page, path = 'screenshot.png') => {
    console.log('ss: ' + path);
    await page.screenshot({ path });
  },
  /**
   * 2020-01-01 23:59:59
   * @param {number} milliSecond
   * @return {string}
   */
  getDate: (milliSecond) => {
    if (milliSecond == null) milliSecond = Date.now();
    const date = new Date(milliSecond);
    return (
      '' +
      date.getFullYear() +
      '-' +
      date.getMonth() +
      '-' +
      date.getDate() +
      ' ' +
      date.getHours() +
      ':' +
      date.getMinutes() +
      ':' +
      date.getSeconds()
    );
  },
  /**
   * @param {string} str
   * @return {number}
   */
  intval: (str) => {
    return parseInt('0' + str.replace(/\D/g, ''));
  },
  /**
   * 配列の差分(増加)取得する.
   * @template T
   * @param {Array<T>} array1
   * @param {Array<T>} array2
   * @param {Function} compareFunction
   * @return {Array<T>}
   */
  arrayDiff: (array1, array2, compareFunction) => {
    return array2.filter((obj1) => {
      return !array1.some((obj2) => {
        if (typeof compareFunction === 'function') {
          return compareFunction(obj1, obj2);
        } else {
          return obj1 === obj2;
        }
      });
    });
  },
};

(async () => {
  // 起動.
  const browser = await puppeteer.launch({
    headless: true,
    devtools: false,
    slowMo: 0,
    executablePath,
  });
  const page = await browser.newPage();
  // const page = (await browser.pages())[0];
  await page.setViewport({ width: 1920, height: 1080 });

  // ページ内から window.consolelog() で出力できるようにする.
  await page.exposeFunction('consolelog', (message) => {
    console.log('consolelog:', message);
  });

  // 遷移.
  console.log('goto.');
  await page.goto(url, { waitUntil: 'load' });
  // await page.waitForNavigation({waitUntil: 'domcontentloaded'});
  console.log('loaded.');
  // await page.waitForSelector('.view-count');
  await page.waitFor(2000);

  let buffer = '';
  /** 起動時ののタイトル */
  let titled = await page.$eval('title', (e) => {
    return e.textContent;
  });
  console.log(url, titled);

  let count_ = null;
  /** 前回の時刻 */
  let time_ = Date.now();
  /** 前回のyl */
  let yl_;

  func.appendLog(url + ',' + titled);

  func.appendLog(
    '日付 時刻,同時視聴者数,delta視聴者数,deltaTime,高評価数,低評価数,新規メンバ数,合計スパチャ額'
  );

  /** チャット処理用 */
  const Chat = {
    /**
     * @typedef {Object} Member
     * @property {string} id
     */
    /**
     * @typedef {Object} Paid
     * @property {string} id
     * @property {string} amount
     */
    /** @type {Array<Member>} */
    members: [],
    /** @type {Array<Paid>} */
    paids: [],
    paidAmount: 0,
    /**
     * 新旧メンバー・スパチャを取得する.
     * @param {HTMLIFrameElement} iframe
     * @return {{members:Array<Member>, paids:Array<Paid>}}
     */
    getTicker: (iframe) => {
      /** iframe から取得した document */
      const doc = iframe.contentDocument;
      // チャットから新旧メンバーを取得する.
      const members = Array.from(
        doc.querySelectorAll('yt-live-chat-ticker-sponsor-item-renderer'),
        (element) => {
          return {
            id: element.id,
          };
        }
      );
      // チャットから新旧スパチャを取得する.
      const paids = Array.from(
        doc.querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer'),
        function (element) {
          return {
            id: element.id,
            amount: element.getAttribute('aria-label'),
          };
        }
      );
      return { members, paids };
    },
    check: async () => {
      const obj = await page.$eval(
        'iframe.ytd-live-chat-frame',
        Chat.getTicker
      );
      // 新規メンバーの差分を追加.
      Chat.members.push(
        // obj.members と Chat.members の差分を検索する.
        ...func.arrayDiff(
          obj.members,
          Chat.members,
          (m1, m2) => m1.id === m2.id
        )
      );

      // obj.paids と Chat.paids の差分を検索する.
      const paids = func.arrayDiff(
        obj.paids,
        Chat.paids,
        (m1, m2) => m1.id === m2.id
      );
      console.log(paids);

      // 新規スパチャの差分を追加.
      Chat.paids.push(...paids);
      // 決算.
      paids.forEach((paid) => {
        Chat.paidAmount += func.intval(paid.amount);
      });
    },
  };

  /**
   * textContent 取得ショートコード
   * @param {string} selector
   */
  const tc = async (selector) => {
    return await page.$eval(selector, (element) => element.textContent);
  };

  /* メインループ. */
  for (let cnt = 0; ; cnt++) {
    // 取得
    const title = await page.$eval('title', (e) => e.textContent);
    const output = await page.$eval('.view-count', (e) => e.textContent);
    const liveState = await page.$eval(
      '#date > yt-formatted-string',
      (element) => {
        return element.textContent;
      }
    );

    // 終了確認.
    if (
      title !== titled || // タイトルが変わったら.
      !/視聴中|待機/.test(output) || // 再生数表記に変わったら.
      !/プレミア公開|配信開始|開始予定/.test(liveState) // ライブの状態が過去の表記に変わったら.
    ) {
      console.log(
        'break: output=' + output + ',title=' + title + ',State=' + liveState
      );
      buffer = output;
      titled = title;
      break;
    }

    /** @type {YoutubeLive} YoutubeLive 情報 */
    const yl = {
      count: func.intval(await tc('.view-count')),
      rate: {
        high: func.intval(
          await tc(
            'ytd-video-primary-info-renderer #info ytd-toggle-button-renderer:nth-child(1)>a>yt-formatted-string'
          )
        ),
        low: func.intval(
          await tc(
            'ytd-video-primary-info-renderer #info ytd-toggle-button-renderer:nth-child(2)>a>yt-formatted-string'
          )
        ),
      },
      state: await tc(
        'ytd-video-primary-info-renderer #date > yt-formatted-string'
      ),
      title: await tc('ytd-video-primary-info-renderer h1 yt-formatted-string'),
      time: Date.now(),
    };
    // チャット処理.
    await Chat.check();

    // 計算
    /** 視聴者数の変化量 */
    const dCount = count_ == null ? 0 : yl.count - count_;

    /** 保存方式 */
    const isDelta = false;
    if (isDelta) {
      // 視聴者数変化があれば
      if (count_ !== yl.count) {
        const line =
          func.getDate(yl.time) +
          ',' +
          yl.count +
          ',' +
          dCount +
          ',' +
          (yl.time - time_) / 1000 +
          ',' +
          yl.rate.high +
          ',' +
          yl.rate.high;
        time_ = yl.time;
        console.log(line);
        func.appendLog(line);
        // update
        count_ = yl.count;
      }
    } else {
      const stdout =
        '時間:' +
        func.getDate(yl.time) +
        ',視聴者数:' +
        yl.count +
        ',delta視聴者数:' +
        dCount +
        ',高評価:' +
        yl.rate.high +
        ',低評価:' +
        yl.rate.low +
        ',メンバー数:' +
        Chat.members.length +
        ',金額合計:' +
        Chat.paidAmount;
      const line =
        func.getDate(yl.time) + // 時間.
        ',' +
        yl.count + // 視聴者数.
        ',' +
        dCount + // delta視聴者数.
        ',' +
        parseInt((yl.time - time_) / 1000) +
        ',' +
        yl.rate.high +
        ',' +
        yl.rate.low +
        ',' +
        Chat.members.length +
        ',' +
        Chat.paidAmount;
      time_ = yl.time;
      count_ = yl.count;
      if (dCount !== 0) {
        // process.stdout.write('\n' + stdout);
        console.log(stdout);
      } else {
        const char = ['\\', '|', '/', '-'];
        process.stdout.write(char[cnt % char.length]);
        readline.cursorTo(process.stdout, 0);
      }
      func.appendLog(line);
    }
    // 稀にスクショ.
    if (func.rnd(2) === 1 && dCount !== 0) {
      await func.ss(page);
    }
    yl_ = yl;
    await page.$eval('#movie_player video', (element) => {
      // 再生されていたら止めて負荷軽減.
      if (!element.paused) element.pause();
    });
    // 待機
    await page.waitFor(5000);
  }

  console.log('shutdown.');
  await func.ss(page);
  await browser.close();
})();
