#!/bin/bash

# 配置
LOCAL_PROP="./update.prop"
# 替换为你实际的远程地址
REMOTE_PROP_URL="https://raw.githubusercontent.com/YuleBest/FontMM/main/update.prop"

# 提取函数
get_prop() {
    grep "^${1}=" "$2" | cut -d'=' -f2- | tr -d '\r'
}

# 1. 环境准备
if [ ! -f "$LOCAL_PROP" ]; then
    echo "错误: 本地找不到 update.prop，请确保脚本在项目根目录运行。"
    exit 1
fi

TEMP_PROP=$(mktemp)
echo "正在检查云端更新..."
if ! curl -sL "$REMOTE_PROP_URL" -o "$TEMP_PROP"; then
    echo "错误: 无法连接到服务器。"
    exit 1
fi

# 2. 解析版本信息
LOCAL_VC=$(get_prop "versionCode" "$LOCAL_PROP")
# 这里的逻辑假设本地只记录一个当前运行的 versionCode
LOCAL_VC=${LOCAL_VC:-0}

REMOTE_VC=$(get_prop "versionCode" "$TEMP_PROP")
REMOTE_VER=$(get_prop "version" "$TEMP_PROP")

TEST_VC=$(get_prop "testVersionCode" "$TEMP_PROP")
TEST_VER=$(get_prop "testVersion" "$TEMP_PROP")

# 标志位：是否有更新
HAS_STABLE=false
HAS_TEST=false

[ "$REMOTE_VC" -gt "$LOCAL_VC" ] && HAS_STABLE=true
[ "$TEST_VC" -gt "$LOCAL_VC" ] && HAS_TEST=true

# 3. 交互逻辑
if $HAS_STABLE && $HAS_TEST; then
    echo "发现多个新版本可用："
    echo "1. 正式版: $REMOTE_VER (Code: $REMOTE_VC)"
    echo "2. 测试版: $TEST_VER (Code: $TEST_VC)"
    echo "3. 暂不更新"
    read -p "请输入选项 [1-3]: " choice
    case $choice in
        1) TARGET_VER=$REMOTE_VER; TARGET_VC=$REMOTE_VC ;;
        2) TARGET_VER=$TEST_VER; TARGET_VC=$TEST_VC ;;
        *) echo "已取消"; rm "$TEMP_PROP"; exit 0 ;;
    esac
elif $HAS_STABLE; then
    echo "发现新正式版: $REMOTE_VER"
    read -p "是否更新？[y/N]: " choice
    [[ "$choice" == [Yy] ]] && { TARGET_VER=$REMOTE_VER; TARGET_VC=$REMOTE_VC; } || { echo "已退出"; exit 0; }
elif $HAS_TEST; then
    echo "发现新测试版: $TEST_VER"
    read -p "是否尝鲜更新？[y/N]: " choice
    [[ "$choice" == [Yy] ]] && { TARGET_VER=$TEST_VER; TARGET_VC=$TEST_VC; } || { echo "已退出"; exit 0; }
else
    echo "目前已是最新版本，无需更新。"
    rm "$TEMP_PROP"
    exit 0
fi

# 4. 执行下载逻辑
if [ -n "$TARGET_VER" ]; then
    echo "--- 开始更新至 $TARGET_VER ---"
    # 这里可以根据 TARGET_VER 拼接你的下载 URL
    # DOWNLOAD_URL=".../FontMM_${TARGET_VER}.zip"
    
    # 下载、解压、覆盖操作...
    # ...
    
    # 5. 更新本地 prop (建议保留用户选择后的版本信息)
    # 注意：这里可能需要根据你更新后的实际版本来重写本地 prop
    cp "$TEMP_PROP" "$LOCAL_PROP"
    echo "更新完成！"
fi

rm -f "$TEMP_PROP"
