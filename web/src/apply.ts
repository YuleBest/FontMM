import { exec, shellQuote, toast } from './ksu';
import { copyFont, pickWghtRange, refreshEnSubset, renderSlots, setApplying, slots } from './slots';
import { applyWghtOverride, getSelectedWghtMode, writeWghtMode } from './wght';
import { invalidateTestFonts } from './testFonts';
import { applyBtn } from './dom';
import { FONTS_DIR } from './constants';

const logDialog = document.getElementById('log-dialog') as any;
const logContent = document.getElementById('log-content')!;

document.getElementById('log-close')?.addEventListener('click', () => {
  logDialog.open = false;
});

async function apply() {
  if (!slots.hans.path) return;
  setApplying(true);
  renderSlots();
  try {
    // 字重范围覆写: 用 UI 当前模式 (持久化到 FONTS/wght-mode.txt), 仅当存在可变字体且模式非 0 时处理
    const wghtMode = getSelectedWghtMode();
    await writeWghtMode(wghtMode);
    const wghtPick = pickWghtRange();
    if (wghtMode !== 0 && wghtPick) {
      // Go 程序自行读取 wght-map.txt (mode 3)
      await applyWghtOverride(wghtMode, wghtPick.min, wghtPick.max);
    }

    // 启动加载的字体 path 即 FONT/ 内的文件, 无需再复制
    if (slots.hans.path !== `${FONTS_DIR}/hans.ttf`) {
      await copyFont(slots.hans.path, `${FONTS_DIR}/hans.ttf`);
    }

    if (slots.hant.path) {
      if (slots.hant.path !== `${FONTS_DIR}/hant.ttf`) {
        await copyFont(slots.hant.path, `${FONTS_DIR}/hant.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/hant.ttf`)}`);
    }

    if (slots.en.path) {
      if (slots.en.path !== `${FONTS_DIR}/en.ttf`) {
        await copyFont(slots.en.path, `${FONTS_DIR}/en.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/en.ttf`)}`);
    }

    if (slots.mono.path) {
      if (slots.mono.path !== `${FONTS_DIR}/mono.ttf`) {
        await copyFont(slots.mono.path, `${FONTS_DIR}/mono.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/mono.ttf`)}`);
    }

    if (slots.emoji.path) {
      if (slots.emoji.path !== `${FONTS_DIR}/emoji.ttf`) {
        await copyFont(slots.emoji.path, `${FONTS_DIR}/emoji.ttf`);
      }
    } else {
      await exec(`rm -f ${shellQuote(`${FONTS_DIR}/emoji.ttf`)}`);
    }

    const { errno, stdout, stderr } = await exec('sh /data/adb/modules/FontMM/apply.sh');
    if (errno !== 0) throw new Error(stderr || 'apply.sh 执行失败');

    if (logContent && logDialog) {
      logContent.textContent = stdout;
      logDialog.open = true;
    }
    toast('字体已应用，重启后生效');
    // 字体已变化: 下次进入测试页时重新加载
    invalidateTestFonts();
  } catch (e) {
    toast(`应用失败: ${String(e)}`);
  } finally {
    setApplying(false);
    // 应用后刷新英文子集结果 (issue #14): 子集大小只有跑过 apply.sh 才知道
    await refreshEnSubset();
    renderSlots();
  }
}

applyBtn?.addEventListener('click', apply);
