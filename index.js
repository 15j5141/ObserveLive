/**
 * @typedef {object} YoutubeLive
 * @property {number} count 同時視聴者数
 * @property {object} rate 評価
 * @property {number} rate.high 高評価数
 * @property {number} rate.low 低評価数
 * @property {string} state 配信状態
 * @property {string} title タイトル
 * @property {string} time 取得時間
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
const func = {
  filename: 'log/' + logName,
  getCount: () => {
    const dom = document.querySelector('.view-count');
    return dom == null ? 'null.' : dom.textContent;
  },

  appendLog: (log) => {
    fs.appendFile(path.join(__dirname, func.filename), log + '\n', (error) => {
      if (error) {
        console.log('err:', error);
      } else {
        // console.log('wrote log');
      }
    });
  },
  writeLog: (log) => {
    fs.writeFile(path.join(__dirname, func.filename), log, (error) => {
      if (error) {
        console.log('err:', error);
      } else {
        console.log('wrote:', log);
      }
    });
  },

  aaa: () => {
    const node = document.querySelectorAll('.view-count').item(0);
    const observer = new MutationObserver(function (e) {
      console.log(e);
      window.onCustomEvent({ text: e.target.textContent });
    });
    observer.observe(node);
  },
  /**
   * 0 ~ max の乱数
   * @param {number} max
   * @return {number}
   */
  rnd: (max) => {
    return Math.floor(Math.random() * Math.floor(max));
  },
  ss: async (page, path = 'screenshot.png') => {
    console.log('ss: ' + path);
    await page.screenshot({ path });
  },
  /**
   * 2020-01-01 23:59:59
   * @param {number} milliSecond
   * @return {string}
   */
  getDate(milliSecond) {
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
};

(async () => {
  // 起動.
  const browser = await puppeteer.launch({
    headless: true,
    devtools: false,
    slowMo: 0,
    executablePath:
      'C:\\Program Files (x86)\\Google\\Chrome Beta\\Application\\chrome.exe',
  });
  const page = await browser.newPage();
  // const page = (await browser.pages())[0];
  await page.setViewport({ width: 1920, height: 1080 });
  // page.setUserAgent(ua);
  // await page.emulate(iPhone);

  // Define a window.onCustomEvent function on the page.
  await page.exposeFunction('onCustomEvent', (e) => {
    console.log(`${e.text}`);
  });
  await page.exposeFunction('consolelog', (e) => {
    console.log('consolelog:', e);
  });

  // 遷移.
  console.log('goto.');
  await page.goto(url, { waitUntil: 'load' });
  // await page.waitForNavigation({waitUntil: 'domcontentloaded'});
  console.log('loaded.');
  // await page.waitForSelector('.view-count');
  await page.waitFor(2000);
  // const dom = await page.$('.view-count');
  // console.log(dom);

  // await page.evaluate( aaa );
  // await page.waitFor(10000);

  let buffer = '';
  let titled = await page.$eval('title', (e) => {
    // window.consolelog(e.textContent);
    return e.textContent;
  });
  console.log(titled);

  let count_ = null;
  /** 前回の時刻 */
  let time_ = Date.now();
  /** 前回のyl */
  let yl_;

  func.appendLog(url + ',' + titled);
  // page.on('load', async () => {
  //   console.log('exit.');
  //   await func.ss(page);
  //   await browser.close();
  //   process.exit();
  // });

  const Chat = {
    members: [],
    paids: [],
    paidAmount: 0,
    /** @return {Document}*/
    getIframe: async () => {
      return await page.$eval('iframe.ytd-live-chat-frame', (element) => {
        return element.contentDocument;
      });
    },
    check: async () => {
      const obj = await page.$eval('iframe.ytd-live-chat-frame', (element) => {
        const doc = element.contentDocument;
        const result = {
          memberIDs: [],
          paidIDs: [],
          paidAmounts: [],
        };
        doc
          .querySelectorAll('yt-live-chat-ticker-sponsor-item-renderer')
          .forEach((member) => {
            result.memberIDs.push(element.id);
          });
        doc
          .querySelectorAll('yt-live-chat-ticker-paid-message-item-renderer')
          .forEach((element) => {
            result.paidIDs.push(element.id);
            result.paidAmounts.push(
              parseInt(element.getAttribute('aria-label').replace(/\D/g, ''))
            );
          });
        return result;
      });
      // 新規メンバーを追加.
      obj.memberIDs.forEach((id) => {
        if (!Chat.members.includes(id)) Chat.members.push(id);
      });
      // 決算.
      obj.paidIDs.forEach((id, i) => {
        if (!Chat.paids.includes(id)) {
          Chat.paids.push(id);
          Chat.paidAmount += obj.paidAmounts[i];
        }
      });
    },
  };

  const tc = async (selector) => {
    return await page.$eval(selector, (element) => element.textContent);
  };
  for (;;) {
    // 取得
    const output = await page.$eval('.view-count', (e) => e.textContent);
    const title = await page.$eval('title', (e) => e.textContent);

    // 終了確認.
    if (output.indexOf('視聴中') === -1 && output.indexOf('待機') === -1) {
      console.log('break: output=' + output);
      buffer = output;
      break;
    }
    if (title !== titled) {
      titled = title;
      console.log('break: title=' + title);
      break;
    }
    const liveState = await page.$eval(
      '#date > yt-formatted-string',
      (element) => {
        return element.textContent;
      }
    );
    if (
      liveState.indexOf('配信開始') === -1 &&
      liveState.indexOf('開始予定') === -1
    ) {
      console.log('break: liveState=' + liveState);
      break;
    }

    /** @type {YoutubeLive} YoutubeLive情報 */
    const yl = {
      count: (await tc('.view-count')).replace(/\D/g, ''),
      rate: {
        high: await tc(
          'ytd-video-primary-info-renderer #info ytd-toggle-button-renderer:nth-child(1)>a>yt-formatted-string'
        ),
        low: await tc(
          'ytd-video-primary-info-renderer #info ytd-toggle-button-renderer:nth-child(2)>a>yt-formatted-string'
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
    const dCount = yl.count - (count_ || 0);

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
        process.stdout.write('.');
      }
      func.appendLog(line);
    }
    // 稀にスクショ.
    if (func.rnd(2) === 1) {
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

  console.log(titled, buffer);
  await func.ss(page);
  // appendLog(output);

  await browser.close();
})();
