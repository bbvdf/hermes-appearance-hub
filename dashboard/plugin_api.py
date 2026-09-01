"""ui-beautify(界面UI)后端:枚举本机已安装字体。

桌面面板用 GET /fonts 填充字体下拉框(替代手工 FONTS 预设)。
数据源:Windows 字体注册表(HKLM + HKCU),名字形如 "Maple UI (TrueType)",
剥掉括号后缀后即 CSS font-family 家族名。
"""

import re
import winreg

from fastapi import APIRouter

router = APIRouter()

_FONT_KEY_PATHS = (
    r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts",  # HKLM:系统字体
    r"Software\Microsoft\Windows NT\CurrentVersion\Fonts",  # HKCU:用户安装字体
)
_PAREN = re.compile(r"\s*\([^)]*\)\s*$")


def _read_registry_fonts() -> set[str]:
    fonts: set[str] = set()
    for path in _FONT_KEY_PATHS:
        try:
            key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, path) if "SOFTWARE" in path else winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, path
            )
        except OSError:
            continue
        try:
            i = 0
            while True:
                try:
                    name, _val, _kind = winreg.EnumValue(key, i)
                except OSError:
                    break
                i += 1
                family = _PAREN.sub("", str(name)).strip()
                if family:
                    fonts.add(family)
        finally:
            key.Close()
    return fonts


@router.get("/fonts")
async def list_fonts() -> dict:
    fonts = _read_registry_fonts()
    return {"fonts": sorted(fonts)}