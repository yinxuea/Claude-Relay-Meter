#!/usr/bin/env node

/**
 * 自动版本更新和打包脚本
 * 使用方法：npm run release
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 获取当前版本号
function getCurrentVersion() {
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

// 更新版本号
function updateVersion(type = 'patch') {
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  const [major, minor, patch] = packageJson.version.split('.').map(Number);

  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }

  packageJson.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

  console.log(`✅ 版本号已更新: ${packageJson.version} -> ${newVersion}`);
  return newVersion;
}

// 运行命令
function runCommand(command, description) {
  console.log(`\n🔄 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    console.log(`✅ ${description} 完成`);
  } catch (error) {
    console.error(`❌ ${description} 失败`);
    process.exit(1);
  }
}

// 获取扩展的发布者ID
function getExtensionId() {
  const packagePath = path.join(__dirname, '../package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return `${packageJson.publisher}.${packageJson.name}`;
}

// 卸载旧版本扩展
function uninstallExtension() {
  console.log(`\n🗑️ 卸载旧版本扩展...`);
  try {
    const extensionId = getExtensionId();
    console.log(`📋 扩展ID: ${extensionId}`);

    // 卸载扩展（忽略错误，因为可能没有安装）
    const result = execSync(`code --uninstall-extension "${extensionId}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd: path.join(__dirname, '..')
    });

    if (result.includes('was successfully uninstalled')) {
      console.log(`✅ 旧版本扩展已卸载`);
    } else {
      console.log(`ℹ️ 未找到已安装的扩展，将进行全新安装`);
    }
    return true;
  } catch (error) {
    // 卸载失败通常是正常的（比如扩展没有安装）
    console.log(`ℹ️ 旧版本扩展未安装或卸载失败，继续新安装`);
    return true;
  }
}

// 安装 VSIX 扩展
function installExtension(vsixPath) {
  console.log(`\n📦 安装扩展: ${vsixPath}`);
  try {
    // 检查 VSIX 文件是否存在
    if (!fs.existsSync(vsixPath)) {
      console.error(`❌ VSIX 文件不存在: ${vsixPath}`);
      return false;
    }

    // 先卸载旧版本
    uninstallExtension();

    // 安装新扩展
    execSync(`code --install-extension "${vsixPath}" --force`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });

    console.log(`✅ 扩展安装成功`);
    console.log(`🔄 扩展已重新加载，新功能将立即生效`);
    return true;
  } catch (error) {
    console.error(`❌ 扩展安装失败`);
    console.log(`请手动安装: code --uninstall-extension "${getExtensionId()}" && code --install-extension "${vsixPath}" --force`);
    return false;
  }
}

// 主函数
async function main() {
  console.log('🚀 开始自动打包流程...\n');

  // 检查是否在正确的目录
  const packagePath = path.join(__dirname, '../package.json');
  if (!fs.existsSync(packagePath)) {
    console.error('❌ 未找到 package.json，请在项目根目录运行此脚本');
    process.exit(1);
  }

  // 获取命令行参数
  const args = process.argv.slice(2);
  const versionType = args[0] || 'patch'; // 默认 patch
  const installFlag = args.includes('--install') || args.includes('-i'); // 是否自动安装

  // 验证版本类型
  if (!['major', 'minor', 'patch'].includes(versionType)) {
    console.error(`❌ 无效的版本类型: ${versionType}`);
    console.log('使用方法: node scripts/release.js [major|minor|patch] [--install]');
    process.exit(1);
  }

  // 显示当前版本
  const currentVersion = getCurrentVersion();
  console.log(`📌 当前版本: ${currentVersion}`);

  // 步骤 1: 更新版本号
  const newVersion = updateVersion(versionType);

  // 步骤 2: 编译
  runCommand('npm run compile', '编译 TypeScript');

  // 步骤 3: 打包
  const vsixFileName = `claude-relay-meter-${newVersion}.vsix`;
  const vsixPath = path.join(__dirname, '../builds', vsixFileName);
  const buildsDir = path.dirname(vsixPath);

  // 确保 builds 目录存在
  if (!fs.existsSync(buildsDir)) {
    fs.mkdirSync(buildsDir, { recursive: true });
  }

  runCommand(`npm run package`, '打包 VSIX');

  // 步骤 4: 移动到 builds 目录（如果需要）
  const defaultVsixPath = path.join(__dirname, `../${vsixFileName}`);
  if (fs.existsSync(defaultVsixPath)) {
    fs.renameSync(defaultVsixPath, vsixPath);
    console.log(`✅ VSIX 文件已移动到: ${vsixPath}`);
  }

  // 步骤 5: 自动安装（如果指定了 --install）
  if (installFlag) {
    const success = installExtension(vsixPath);
    if (!success) {
      process.exit(1);
    }
  } else {
    console.log(`\n💡 提示: 使用以下命令手动安装扩展:`);
    console.log(`   code --install-extension "${vsixPath}" --force`);
  }

  console.log('\n🎉 自动打包流程完成!');
  console.log(`📦 版本: ${newVersion}`);
  console.log(`📂 文件: ${vsixPath}`);
}

// 运行主函数
main().catch(error => {
  console.error('\n❌ 流程执行失败:', error.message);
  process.exit(1);
});
