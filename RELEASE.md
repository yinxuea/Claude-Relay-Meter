# 自动发布和打包指南

本项目提供了一键式自动版本更新、打包和安装功能。

## 脚本列表

### 📦 打包脚本

```bash
# 1. 仅更新版本号并打包（默认 patch 版本）
npm run release

# 2. 指定版本类型并打包
npm run release:patch    # 更新补丁版本 (1.0.0 -> 1.0.1)
npm run release:minor    # 更新次版本 (1.0.0 -> 1.1.0)
npm run release:major    # 更新主版本 (1.0.0 -> 2.0.0)

# 3. 打包并自动安装扩展
npm run release:install          # patch 版本 + 安装
npm run release:install:patch    # patch 版本 + 安装
npm run release:install:minor    # minor 版本 + 安装
npm run release:install:major    # major 版本 + 安装
```

### 📋 手动打包（不推荐）

```bash
# 传统方式：需要手动更新版本号
npm run compile      # 编译
npm run package      # 打包（VSIX 文件生成到 builds/ 目录）
```

## 自动化流程

当运行 `npm run release` 或类似命令时，脚本会自动执行以下步骤：

1. ✅ **更新版本号** - 自动递增 package.json 中的版本号
2. ✅ **编译代码** - 运行 `npm run compile`
3. ✅ **打包扩展** - 生成 VSIX 文件到 `builds/` 目录
4. ✅ **自动安装** - 将扩展安装到 VSCode（仅限 `--install` 命令）

## 输出文件

- **位置**: `builds/claude-relay-meter-{version}.vsix`
- **示例**: `builds/claude-relay-meter-1.0.11.vsix`

## 使用示例

### 场景 1: 发布新补丁版本（修复 bug）

```bash
npm run release
```

输出：
```
🚀 开始自动打包流程...

📌 当前版本: 1.0.10
✅ 版本号已更新: 1.0.10 -> 1.0.11

🔄 编译 TypeScript...
✅ 编译 TypeScript 完成

🔄 打包 VSIX...
✅ 打包 VSIX 完成

💡 提示: 使用以下命令手动安装扩展:
   code --install-extension "builds/claude-relay-meter-1.0.11.vsix" --force

🎉 自动打包流程完成!
📦 版本: 1.0.11
📂 文件: builds/claude-relay-meter-1.0.11.vsix
```

### 场景 2: 发布新版本（新增功能）

```bash
npm run release:minor
```

### 场景 3: 一键发布并安装到 VSCode

```bash
npm run release:install
```

这会自动：
1. 更新版本号
2. 编译
3. 打包
4. 安装到 VSCode（重启 VSCode 后生效）

## 命令行参数

你也可以直接使用 Node.js 脚本，支持更多自定义选项：

```bash
# 基本���法
node scripts/release.js [versionType] [--install]

# 参数说明：
#   versionType: patch | minor | major (默认: patch)
#   --install 或 -i: 打包后自动安装扩展

# 示例
node scripts/release.js minor --install
```

## 注意事项

1. **VSCode 必须已安装**：自动安装功能需要系统已安装 VSCode 且 `code` 命令可用
2. **版本号格式**：遵循语义化版本规范 (SemVer)
3. **Git 提交**：脚本不会自动提交更改，需要手动提交版本更新
4. **目录结构**：
   - 源码：`src/`
   - 编译输出：`out/`
   - VSIX 文件：`builds/`

## 故障排除

### 问题：VSIX 文件生成失败

**解决方案**：
```bash
# 确保所有依赖已安装
npm install

# 检查 TypeScript 编译错误
npm run compile
```

### 问题：`code` 命令不可用

**解决方案**：
1. 将 VSCode 添加到系统 PATH
2. 或者使用手动安装：
   ```bash
   code --install-extension builds/claude-relay-meter-{version}.vsix --force
   ```

### 问题：权限错误

**解决方案**：
- Linux/macOS：添加执行权限
  ```bash
  chmod +x scripts/release.js
  ```
- Windows：以管理员身份运行命令提示符

## 自定义配置

如需修改脚本行为，编辑 `scripts/release.js` 文件：

- 修改默认版本类型
- 更改输出目录
- 添加自定义打包步骤
- 集成 Git 提交和标签
