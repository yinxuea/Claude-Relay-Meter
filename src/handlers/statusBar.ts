/**
 * 文件说明：状态栏处理器
 * 作用：负责创建和更新 VSCode 状态栏显示
 */

import * as vscode from 'vscode';
import { RelayApiResponse, CostStats } from '../interfaces/types';
import { formatCost, formatPercentage, formatTooltipLine, formatLargeNumber, formatRemainingTime, formatNumberWithDecimals } from '../utils/formatter';
import { getStatusBarColor } from '../utils/colorHelper';
import { log } from '../utils/logger';
// import { t } from '../utils/i18n'; // i18n 已移除
import * as ConfigManager from '../utils/configManager';

// 导入版本信息
const packageJson = require('../../package.json');
const extensionVersion = packageJson.version;

/**
 * 创建状态栏项
 * @returns VSCode 状态栏项实例
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  log('[状态栏] 创建状态栏项...');

  // 创建状态栏项，显示在右侧，优先级为 100
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );

  // 设置点击命令（点击状态栏项时执行刷新）
  statusBarItem.command = 'claude-relay-meter.refreshStats';

  log('[状态栏] 状态栏项创建成功');
  return statusBarItem;
}

/**
 * 更新状态栏显示
 * @param statusBarItem - 状态栏项实例
 * @param data - API 响应数据
 * @param apiUrl - API 基础地址
 * @param apiId - API 标识符
 */
export function updateStatusBar(
  statusBarItem: vscode.StatusBarItem,
  data: RelayApiResponse,
  apiUrl: string,
  apiId: string
): void {
  try {
    log('[状态栏] 开始更新状态栏显示...');

    // 输出完整的API响应数据
    log('[状态栏] API响应数据详情:');
    log(`[状态栏] 完整响应数据: ${JSON.stringify(data, null, 2)}`);
    log(`[状态栏] 用户信息: ID=${data.data.id}, 名称=${data.data.name}, 状态=${data.data.isActive ? '激活' : '未激活'}, 权限=${data.data.permissions}`);
    log(`[状态栏] 时间信息: 创建时间=${data.data.createdAt}, 激活时间=${data.data.activatedAt}`);
    if (data.data.expiresAt) {
      log(`[状态栏] 过期时间=${data.data.expiresAt}, 过期模式=${data.data.expirationMode}`);
    }
    if (data.data.activationDays > 0) {
      log(`[状态栏] 激活天数=${data.data.activationDays}天`);
    }

    // 输出使用统计
    const usage = data.data.usage;
    log(`[状态栏] 使用统计 - 总请求: ${usage.total.requests}, 总Token: ${usage.total.allTokens}, 输入Token: ${usage.total.inputTokens}, 输出Token: ${usage.total.outputTokens}`);
    log(`[状态栏] 使用统计 - 缓存创建Token: ${usage.total.cacheCreateTokens}, 缓存读取Token: ${usage.total.cacheReadTokens}, 总费用: ${usage.total.formattedCost}`);

    // 输出使用效率分析
    const avgTokensPerRequest = usage.total.requests > 0 ? Math.round(usage.total.allTokens / usage.total.requests) : 0;
    const avgCostPerRequest = usage.total.requests > 0 ? usage.total.cost / usage.total.requests : 0;
    const totalCacheTokens = usage.total.cacheCreateTokens + usage.total.cacheReadTokens;
    const cacheEfficiency = usage.total.allTokens > 0 ? ((totalCacheTokens / usage.total.allTokens) * 100).toFixed(1) : '0.0';

    log(`[状态栏] 使用效率分析 - 平均每次请求: ${avgTokensPerRequest} Token, 平均费用: $${formatNumberWithDecimals(avgCostPerRequest, 4)}, 缓存使用率: ${cacheEfficiency}%`);

    // 输出限制信息
    const limits = data.data.limits;
    log(`[状态栏] 限制信息 - 每日限制: ${limits.dailyCostLimit}, 当前每日使用: ${limits.currentDailyCost}`);
    log(`[状态栏] 限制信息 - 总限制: ${limits.totalCostLimit}, 当前总使用: ${limits.currentTotalCost}`);
    log(`[状态栏] 限制信息 - Opus周限制: ${limits.weeklyOpusCostLimit}, 当前Opus周使用: ${limits.weeklyOpusCost}`);
    log(`[状态栏] 限制信息 - 窗口限制: ${limits.rateLimitCost}, 当前窗口使用: ${limits.currentWindowCost}`);
    if (limits.windowRemainingSeconds !== null && limits.windowRemainingSeconds > 0) {
      log(`[状态栏] 限制信息 - 窗口剩余时间: ${limits.windowRemainingSeconds}秒`);
    }

    // 输出账户信息
    const accounts = data.data.accounts;
    if (accounts.claudeAccountId || accounts.geminiAccountId || accounts.openaiAccountId) {
      log(`[状态栏] 关联账户 - Claude: ${accounts.claudeAccountId || '无'}, Gemini: ${accounts.geminiAccountId || '无'}, OpenAI: ${accounts.openaiAccountId || '无'}`);
    } else {
      log('[状态栏] 关联账户: 无');
    }

    // 输出限制规则
    const restrictions = data.data.restrictions;
    if (restrictions.enableModelRestriction && restrictions.restrictedModels.length > 0) {
      log(`[状态栏] 模型限制: 已启用, 限制模型: ${restrictions.restrictedModels.join(', ')}`);
    } else {
      log('[状态栏] 模型限制: 未启用');
    }
    if (restrictions.enableClientRestriction && restrictions.allowedClients.length > 0) {
      log(`[状态栏] 客户端限制: 已启用, 允许客户端: ${restrictions.allowedClients.join(', ')}`);
    } else {
      log('[状态栏] 客户端限制: 未启用');
    }

    // 计算每日费用统计
    const dailyStats = calculateCostStats(
      limits.currentDailyCost,
      limits.dailyCostLimit
    );

    // 检测是否有周限制（rate limit window）
    const hasWindowLimit = limits.currentWindowCost > 0 && limits.rateLimitCost > 0;

    // 根据是否有周限制决定状态栏显示格式
    if (hasWindowLimit) {
      // 计算周限制统计
      const windowStats = calculateCostStats(
        limits.currentWindowCost,
        limits.rateLimitCost
      );

      // 有周限制时，显示：$(graph) 日:$X/$Y Z% | 周:$A/$B C%
      statusBarItem.text = `$(graph) 日:${dailyStats.formattedUsed}/${dailyStats.formattedLimit} ${dailyStats.formattedPercentage}% | 周:${windowStats.formattedUsed}/${windowStats.formattedLimit} ${windowStats.formattedPercentage}%`;

      // 使用周限制的百分比来设置颜色（周限制优先级更高）
      statusBarItem.color = getStatusBarColor(windowStats.percentage);

      log(
        `[状态栏] 状态栏更新成功 - 每日: ${dailyStats.formattedUsed}/${dailyStats.formattedLimit} (${dailyStats.formattedPercentage}%), 周限制: ${windowStats.formattedUsed}/${windowStats.formattedLimit} (${windowStats.formattedPercentage}%)`
      );
    } else {
      // 无周限制时，保持原格式：$(graph) $X/$Y Z%
      statusBarItem.text = `$(graph) ${dailyStats.formattedUsed}/${dailyStats.formattedLimit} ${dailyStats.formattedPercentage}%`;

      // 设置状态栏颜色
      statusBarItem.color = getStatusBarColor(dailyStats.percentage);

      log(
        `[状态栏] 状态栏更新成功 - 每日: ${dailyStats.formattedUsed}/${dailyStats.formattedLimit} (${dailyStats.formattedPercentage}%)`
      );
    }

    // 创建并设置悬停提示
    const tooltip = createTooltip(data, apiUrl, apiId);
    statusBarItem.tooltip = tooltip;

    // 显示状态栏项
    statusBarItem.show();
  } catch (error) {
    log(`[状态栏] 更新状态栏失败：${error}`, true);
    throw error;
  }
}

/**
 * 显示错误状态
 * @param statusBarItem - 状态栏项实例
 * @param errorMessage - 错误消息
 */
export function showErrorStatus(
  statusBarItem: vscode.StatusBarItem,
  errorMessage: string
): void {
  log(`[状态栏] 显示错误状态：${errorMessage}`);

  // 显示错误图标和消息
  statusBarItem.text = `$(alert) ${errorMessage}`;
  statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
  statusBarItem.tooltip = new vscode.MarkdownString(
    `## ⚠️ ⚡ Claude Relay Meter\n\n**错误：** ${errorMessage}\n\n点击状态栏刷新数据`
  );
  statusBarItem.show();
}

/**
 * 显示加载状态
 * @param statusBarItem - 状态栏项实例
 */
export function showLoadingStatus(statusBarItem: vscode.StatusBarItem): void {
  log('[状态栏] 显示加载状态');
  statusBarItem.text = '$(sync~spin) 加载中...';
  statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
  statusBarItem.tooltip = new vscode.MarkdownString('加载中...');
  statusBarItem.show();
}

/**
 * 计算费用统计信息
 * @param used - 已使用金额
 * @param limit - 限额
 * @returns 费用统计对象
 */
function calculateCostStats(used: number, limit: number): CostStats {
  const percentage = limit > 0 ? (used / limit) * 100 : 0;
  const clampedPercentage = Math.max(0, Math.min(100, percentage));

  return {
    used,
    limit,
    percentage: clampedPercentage,
    formattedUsed: formatCost(used),
    formattedLimit: formatCost(limit),
    formattedPercentage: formatPercentage(used, limit),
  };
}

/**
 * 创建悬停提示
 * @param data - API 响应数据
 * @param apiUrl - API 基础地址
 * @param apiId - API 标识符
 * @returns Markdown 格式的提示文本
 */
function createTooltip(data: RelayApiResponse, apiUrl: string, apiId: string): vscode.MarkdownString {
  const limits = data.data.limits;
  const usage = data.data.usage;

  // 计算三种费用统计
  const dailyStats = calculateCostStats(limits.currentDailyCost, limits.dailyCostLimit);
  const totalStats = calculateCostStats(limits.currentTotalCost, limits.totalCostLimit);
  const opusStats = calculateCostStats(limits.weeklyOpusCost, limits.weeklyOpusCostLimit);

  // 创建 Markdown 提示
  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;
  tooltip.supportHtml = true;
  tooltip.supportThemeIcons = true;

  // 标题和基本用户信息
  tooltip.appendMarkdown(`## ⚡ Claude Relay Meter v${extensionVersion}\n`);
  tooltip.appendMarkdown(`### 👤 用户信息\n`);
  tooltip.appendMarkdown(`**名称：** ${data.data.name}\n`);
  tooltip.appendMarkdown(`**ID：** \`${data.data.id}\`\n`);
  tooltip.appendMarkdown(`**描述：** ${data.data.description || '无'}\n`);
  tooltip.appendMarkdown(`**状态：** ${data.data.isActive ? '✅ 激活' : '❌ 未激活'}\n`);
  tooltip.appendMarkdown(`**权限：** ${data.data.permissions}\n`);

  // 时间信息
  const createdDate = new Date(data.data.createdAt).toLocaleString();
  const activatedDate = new Date(data.data.activatedAt).toLocaleString();
  tooltip.appendMarkdown(`**创建时间：** ${createdDate}\n`);
  tooltip.appendMarkdown(`**激活时间：** ${activatedDate}\n`);

  if (data.data.expiresAt) {
    const expiredDate = new Date(data.data.expiresAt).toLocaleString();
    tooltip.appendMarkdown(`**过期时间：** ${expiredDate}\n`);
    tooltip.appendMarkdown(`**过期模式：** ${data.data.expirationMode}\n`);
  }
  if (data.data.activationDays > 0) {
    tooltip.appendMarkdown(`**激活天数：** ${data.data.activationDays} 天\n`);
  }
  tooltip.appendMarkdown('\n');

  // 费用限制信息
  tooltip.appendMarkdown(`### 💰 费用限制\n`);

  // 每日费用限制
  tooltip.appendMarkdown(`**每日限制：** ${dailyStats.formattedUsed} / ${dailyStats.formattedLimit}  ${getColoredPercentage(dailyStats)}\n`);
  if (limits.dailyCostLimit > 0) {
    tooltip.appendMarkdown(`**每日剩余：** ${formatCost(Math.max(0, limits.dailyCostLimit - limits.currentDailyCost))}\n`);
  }

  // 总费用限制
  if (totalStats.limit > 0) {
    tooltip.appendMarkdown(`**总限制：** ${totalStats.formattedUsed} / ${totalStats.formattedLimit}  ${getColoredPercentage(totalStats)}\n`);
    tooltip.appendMarkdown(`**总剩余：** ${formatCost(Math.max(0, limits.totalCostLimit - limits.currentTotalCost))}\n`);
  }

  // Opus 周费用限制
  if (opusStats.limit > 0) {
    tooltip.appendMarkdown(`**Opus周限制：** ${opusStats.formattedUsed} / ${opusStats.formattedLimit}  ${getColoredPercentage(opusStats)}\n`);
    tooltip.appendMarkdown(`**Opus周剩余：** ${formatCost(Math.max(0, limits.weeklyOpusCostLimit - limits.weeklyOpusCost))}\n`);
  }

  // 检测是否有周限制（rate limit window）
  const hasWindowLimit = limits.currentWindowCost > 0 && limits.rateLimitCost > 0;
  if (hasWindowLimit) {
    const windowStats = calculateCostStats(limits.currentWindowCost, limits.rateLimitCost);
    tooltip.appendMarkdown(`**窗口限制：** ${windowStats.formattedUsed} / ${windowStats.formattedLimit}  ${getColoredPercentage(windowStats)}\n`);
    tooltip.appendMarkdown(`**窗口剩余：** ${formatCost(Math.max(0, limits.rateLimitCost - limits.currentWindowCost))}\n`);

    // 剩余时间显示
    if (limits.windowRemainingSeconds !== null && limits.windowRemainingSeconds > 0) {
      const remainingTime = formatRemainingTime(limits.windowRemainingSeconds);
      tooltip.appendMarkdown(`**重置时间：** ${remainingTime}\n`);
    } else if (limits.windowRemainingSeconds !== null && limits.windowRemainingSeconds <= 0) {
      tooltip.appendMarkdown(`**重置时间：** 已过期\n`);
    }

    if (limits.windowStartTime && limits.windowEndTime) {
      const startTime = new Date(limits.windowStartTime).toLocaleString();
      const endTime = new Date(limits.windowEndTime).toLocaleString();
      tooltip.appendMarkdown(`**窗口周期：** ${startTime} ~ ${endTime}\n`);
    }
  }

  // Token 限制和并发限制
  if (limits.tokenLimit > 0) {
    tooltip.appendMarkdown(`**Token限制：** ${formatLargeNumber(limits.currentWindowTokens)} / ${formatLargeNumber(limits.tokenLimit)}\n`);
  }
  if (limits.concurrencyLimit > 0) {
    tooltip.appendMarkdown(`**并发限制：** ${limits.currentWindowRequests} / ${limits.concurrencyLimit}\n`);
  }
  if (limits.rateLimitRequests > 0) {
    tooltip.appendMarkdown(`**请求数限制：** ${limits.currentWindowRequests} / ${limits.rateLimitRequests}\n`);
  }
  tooltip.appendMarkdown('\n');

  // 详细使用统计
  tooltip.appendMarkdown(`### 📊 详细使用统计\n`);

  // 请求数和 Token 统计
  tooltip.appendMarkdown(`**总请求数：** ${formatLargeNumber(usage.total.requests)}\n`);
  tooltip.appendMarkdown(`**总Token数：** ${formatLargeNumber(usage.total.allTokens)}\n`);
  tooltip.appendMarkdown(`**输入Token：** ${formatLargeNumber(usage.total.inputTokens)}\n`);
  tooltip.appendMarkdown(`**输出Token：** ${formatLargeNumber(usage.total.outputTokens)}\n`);
  tooltip.appendMarkdown(`**缓存创建Token：** ${formatLargeNumber(usage.total.cacheCreateTokens)}\n`);
  tooltip.appendMarkdown(`**缓存读取Token：** ${formatLargeNumber(usage.total.cacheReadTokens)}\n`);

  // 费用信息
  tooltip.appendMarkdown(`**总费用：** ${usage.total.formattedCost}\n`);
  tooltip.appendMarkdown(`**精确费用：** $${formatNumberWithDecimals(usage.total.cost, 6)}\n\n`);

  // 使用效率分析（基于现有数据）
  tooltip.appendMarkdown(`### 📈 使用效率分析\n`);

  // 计算平均每次请求的Token和费用
  const avgTokensPerRequest = usage.total.requests > 0 ? Math.round(usage.total.allTokens / usage.total.requests) : 0;
  const avgCostPerRequest = usage.total.requests > 0 ? usage.total.cost / usage.total.requests : 0;
  const avgInputTokensPerRequest = usage.total.requests > 0 ? Math.round(usage.total.inputTokens / usage.total.requests) : 0;
  const avgOutputTokensPerRequest = usage.total.requests > 0 ? Math.round(usage.total.outputTokens / usage.total.requests) : 0;

  tooltip.appendMarkdown(`**平均每次请求：** ${formatLargeNumber(avgTokensPerRequest)} Token\n`);
  tooltip.appendMarkdown(`&nbsp;&nbsp;&nbsp;&nbsp;输入: ${formatLargeNumber(avgInputTokensPerRequest)} | 输出: ${formatLargeNumber(avgOutputTokensPerRequest)}\n`);
  tooltip.appendMarkdown(`**平均每次请求费用：** $${formatNumberWithDecimals(avgCostPerRequest, 4)}\n`);

  // 缓存效率
  const totalCacheTokens = usage.total.cacheCreateTokens + usage.total.cacheReadTokens;
  const cacheEfficiency = usage.total.allTokens > 0 ? ((totalCacheTokens / usage.total.allTokens) * 100).toFixed(1) : '0.0';
  tooltip.appendMarkdown(`**缓存使用率：** ${cacheEfficiency}% (创建: ${formatLargeNumber(usage.total.cacheCreateTokens)}, 读取: ${formatLargeNumber(usage.total.cacheReadTokens)})\n\n`);

  // Token分布统计
  tooltip.appendMarkdown(`### 🎯 Token分布统计\n`);

  if (usage.total.allTokens > 0) {
    const inputPercentage = ((usage.total.inputTokens / usage.total.allTokens) * 100).toFixed(1);
    const outputPercentage = ((usage.total.outputTokens / usage.total.allTokens) * 100).toFixed(1);
    const cacheCreatePercentage = ((usage.total.cacheCreateTokens / usage.total.allTokens) * 100).toFixed(1);
    const cacheReadPercentage = ((usage.total.cacheReadTokens / usage.total.allTokens) * 100).toFixed(1);

    tooltip.appendMarkdown(`**输入Token：** ${formatLargeNumber(usage.total.inputTokens)} (${inputPercentage}%)\n`);
    tooltip.appendMarkdown(`**输出Token：** ${formatLargeNumber(usage.total.outputTokens)} (${outputPercentage}%)\n`);
    tooltip.appendMarkdown(`**缓存创建Token：** ${formatLargeNumber(usage.total.cacheCreateTokens)} (${cacheCreatePercentage}%)\n`);
    tooltip.appendMarkdown(`**缓存读取Token：** ${formatLargeNumber(usage.total.cacheReadTokens)} (${cacheReadPercentage}%)\n\n`);
  }

  // 账户信息
  tooltip.appendMarkdown(`### 🔗 关联账户\n`);
  if (data.data.accounts.claudeAccountId) {
    tooltip.appendMarkdown(`**Claude账户：** \`${data.data.accounts.claudeAccountId}\`\n`);
  }
  if (data.data.accounts.geminiAccountId) {
    tooltip.appendMarkdown(`**Gemini账户：** \`${data.data.accounts.geminiAccountId}\`\n`);
  }
  if (data.data.accounts.openaiAccountId) {
    tooltip.appendMarkdown(`**OpenAI账户：** \`${data.data.accounts.openaiAccountId}\`\n`);
  }
  if (!data.data.accounts.claudeAccountId && !data.data.accounts.geminiAccountId && !data.data.accounts.openaiAccountId) {
    tooltip.appendMarkdown(`**关联账户：** 无\n`);
  }
  tooltip.appendMarkdown('\n');

  // 限制规则
  tooltip.appendMarkdown(`### ⚙️ 限制规则\n`);
  if (data.data.restrictions.enableModelRestriction && data.data.restrictions.restrictedModels.length > 0) {
    tooltip.appendMarkdown(`**模型限制：** 已启用\n`);
    tooltip.appendMarkdown(`**限制模型：** ${data.data.restrictions.restrictedModels.join(', ')}\n`);
  } else {
    tooltip.appendMarkdown(`**模型限制：** 未启用\n`);
  }

  if (data.data.restrictions.enableClientRestriction && data.data.restrictions.allowedClients.length > 0) {
    tooltip.appendMarkdown(`**客户端限制：** 已启用\n`);
    tooltip.appendMarkdown(`**允许客户端：** ${data.data.restrictions.allowedClients.join(', ')}\n`);
  } else {
    tooltip.appendMarkdown(`**客户端限制：** 未启用\n`);
  }
  tooltip.appendMarkdown('\n');

  // 操作区域
  tooltip.appendMarkdown('---\n');

  // 构建网页仪表板地址
  const webDashboardUrl = `${apiUrl}/admin-next/api-stats?apiId=${apiId}`;
  const webDashboardArgs = encodeURIComponent(JSON.stringify({ url: webDashboardUrl }));

  // 提示和操作按钮
  tooltip.appendMarkdown(`💡 **提示：** 点击状态栏刷新数据\n`);
  tooltip.appendMarkdown(
    `[设置](command:claude-relay-meter.openSettings) | ` +
    `[仪表盘](command:claude-relay-meter.openWebDashboard?${webDashboardArgs}) | ` +
    `[重载配置](command:claude-relay-meter.manualReloadConfig)\n\n`
  );

  // 监听状态提示
  const watchEnabled = ConfigManager.isWatchEnabled();
  if (!watchEnabled) {
    tooltip.appendMarkdown(`⚠️ Claude Settings 监听已关闭\n\n`);
  }

  // 更新时间
  const now = new Date().toLocaleString();
  tooltip.appendMarkdown(`🕐 更新时间：${now}`);

  return tooltip;
}

/**
 * 获取带颜色的百分比文本
 * @param stats - 费用统计对象
 * @returns 格式化的百分比文本（使用 HTML 颜色和 Emoji 指示器）
 */
function getColoredPercentage(stats: CostStats): string {
  const percentage = stats.percentage;

  // 获取配置
  const config = vscode.workspace.getConfiguration('relayMeter');
  const enableColors = config.get<boolean>('enableStatusBarColors', true);
  const thresholds = config.get<{ low: number; medium: number }>('colorThresholds', {
    low: 50,
    medium: 80,
  });
  const customColors = config.get<{ low: string; medium: string; high: string }>('customColors', {
    low: '#66BB6A',
    medium: '#FFD700',
    high: '#FF6600',
  });

  // 如果未启用颜色，使用默认灰色和白色圆形
  if (!enableColors) {
    const defaultColor = '#CCCCCC';
    return `⚪ <span style="color: ${defaultColor}; font-size: 1.1em;"><strong>${stats.formattedPercentage}%</strong></span>`;
  }

  // 根据阈值确定颜色和 Emoji 指示器
  let color: string;
  let indicator: string;

  if (percentage < thresholds.low) {
    // 低使用率：绿色
    color = customColors.low;
    indicator = '🟢';
  } else if (percentage < thresholds.medium) {
    // 中使用率：黄色
    color = customColors.medium;
    indicator = '🟡';
  } else {
    // 高使用率：红色/橙色
    color = customColors.high;
    indicator = '🔴';
  }

  // 使用 HTML span 标签设置颜色，增大字体并加粗
  return `${indicator} <span style="color: ${color}; font-size: 1.1em;"><strong>${stats.formattedPercentage}%</strong></span>`;
}

/**
 * 显示配置提示
 * @param statusBarItem - 状态栏项实例
 * @param missingConfig - 缺失的配置项类型
 */
export function showConfigPrompt(
  statusBarItem: vscode.StatusBarItem,
  missingConfig?: 'apiUrl' | 'apiId' | 'both'
): void {
  log(`[状态栏] 显示配置提示，缺失配置：${missingConfig || 'both'}`);

  // 根据缺失的配置项设置不同的文本
  let statusText = '';
  let tooltipMessage = '';

  if (missingConfig === 'apiUrl') {
    statusText = '$(gear) 未配置 API URL';
    tooltipMessage = '请先配置 API URL（必填）';
  } else if (missingConfig === 'apiId') {
    statusText = '$(gear) 未配置 API ID/Key';
    tooltipMessage = '请先配置 API ID 或 API Key（二选一）';
  } else {
    statusText = '$(gear) Claude Relay Meter 需要配置';
    tooltipMessage = '请先配置 API URL（必填）以及 API ID 或 API Key（二选一）';
  }

  statusBarItem.text = statusText;
  statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');

  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;
  tooltip.appendMarkdown(`⚙️ Claude Relay Meter\n\n需要配置\n\n${tooltipMessage}`);
  tooltip.appendMarkdown(`\n\n[点击打开设置](command:claude-relay-meter.openSettings)\n\n`);
  statusBarItem.tooltip = tooltip;

  statusBarItem.command = 'claude-relay-meter.openSettings';

  // 确保��态栏项可见
  statusBarItem.show();

  log(`[状态栏] 配置提示已设置：${statusText}`);
}

/**
 * 创建重载配置按钮
 * @returns VSCode 状态栏项实例
 */
export function createReloadButton(): vscode.StatusBarItem {
  log('[状态栏] 创建重载配置按钮...');

  // 创建状态栏项，显示在右侧，优先级为 99（在主状态栏项右侧）
  const reloadButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );

  // 设置图标和文本
  reloadButton.text = '$(sync)';
  reloadButton.tooltip = '重载配置';
  reloadButton.command = 'claude-relay-meter.reloadClaudeConfig';

  log('[状态栏] 重载配置按钮创建成功');
  return reloadButton;
}
