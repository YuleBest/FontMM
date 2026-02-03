#!/system/bin/sh
# MODDIR=${0%/*}

# 删除谷歌商店搜索框字体
rm -rf /data/data/com.google.android.gms/files/fonts/opentype
touch /data/data/com.google.android.gms/files/fonts/opentype
chmod 444 /data/data/com.google.android.gms/files/fonts/opentype

# 这个脚本将以 post-fs-data 模式执行(系统启动前执行)
