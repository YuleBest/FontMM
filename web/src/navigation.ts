import { slots } from './slots';
import { loadHome } from './home';
import { loadTestFonts } from './testFonts';
import { applyBtn, rebootBtn } from './dom';

// ---------------- 导航与视图切换 ----------------
const homeView = document.getElementById('home-view')!;
const configView = document.getElementById('config-view')!;
const testView = document.getElementById('test-view')!;
const toolsView = document.getElementById('tools-view')!;

const views = [homeView, configView, testView, toolsView];
const navBar = document.getElementById('nav-bar') as any;
// 悬浮应用按钮 (与配置页绑定, 仅配置页显示)
const applyFab = applyBtn;
// 滑动视图轨道
const viewTrack = document.getElementById('view-track')!;
let currentIndex = 0;

// 顶栏滚动标题: 各页标题元素与相对偏移 (标题中心移出视口顶部时固定在顶栏)
const topBarTitle = document.getElementById('top-bar-title')!;
const pageTitleEls = Array.from(document.querySelectorAll<HTMLElement>('.home-title'));
const titleOffsets = views.map((view, i) => {
  const el = pageTitleEls[i];
  if (!el) return 0;
  return el.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop;
});

// 视口 pager: 轨道高度 = 视口 - 顶栏 (显式计算, 避免依赖 vh/dvh/flex 解析)
function updateTrackHeight() {
  const topBar = document.querySelector<HTMLElement>('.top-app-bar');
  const h = window.innerHeight - (topBar?.offsetHeight ?? 64);
  viewTrack.style.height = `${Math.max(0, h)}px`;
}
updateTrackHeight();
window.addEventListener('resize', updateTrackHeight);
window.addEventListener('orientationchange', () => setTimeout(updateTrackHeight, 100));

function showView(index: number) {
  const target = Math.max(0, Math.min(views.length - 1, index));
  currentIndex = target;
  views.forEach((v, i) => v.classList.toggle('active', i === target));
  // 轨道滑动切换动画
  viewTrack.style.transform = `translateX(${-target * 100}%)`;
  // 悬浮应用按钮仅配置页显示, 且未选简体字体时不展示
  applyFab.style.display = target === 1 && slots.hans.path ? '' : 'none';
  // 重启按钮仅主页显示 (visibility 保持顶栏布局不跳动)
  if (rebootBtn) rebootBtn.style.visibility = target === 0 ? 'visible' : 'hidden';
  // 同步底部导航高亮
  if (navBar) navBar.activeIndex = target;
  // 每页独立滚动, 切换后回到该页顶部
  views[target].scrollTop = 0;
  // 顶栏标题: 切换页时更新文字, 并回到未滚动状态 (标题在内容区显示)
  topBarTitle.textContent = pageTitleEls[target]?.textContent ?? '';
  document.body.classList.remove('title-scrolled');
  if (target === 0) loadHome();
  if (target === 2) loadTestFonts();
}

// 悬浮按钮滚动隐藏: 向下滚动移出视口, 向上滚动出现 (每页独立滚动)
views.forEach((view, i) => {
  let lastY = 0;
  view.addEventListener(
    'scroll',
    () => {
      const y = view.scrollTop;
      if (y > lastY + 4) applyFab.classList.add('fab-hidden');
      else if (y < lastY - 4) applyFab.classList.remove('fab-hidden');
      lastY = y;
      // 顶栏标题: 当前页标题中心移出视口顶部时固定在顶栏
      if (view === views[currentIndex] && pageTitleEls[i]) {
        const titleCenter = titleOffsets[i] + pageTitleEls[i].offsetHeight / 2;
        document.body.classList.toggle('title-scrolled', y > titleCenter);
      }
    },
    { passive: true },
  );
});

navBar?.addEventListener('navigation-bar-activated', (e: { detail: { activeIndex: number } }) => {
  showView(e.detail.activeIndex);
});

// 初始加载主页
void loadHome();
