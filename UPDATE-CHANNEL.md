# PSD Lingo 更新发布渠道

专属仓库：https://github.com/xjc991114xjc520cjq-source/PSD-Lingo

## 当前基线

- 发布版本：0.3.1 本地测试版。
- 下载入口：https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/latest
- 原路径覆盖：运行单 EXE 安装／更新程序。
- 自动更新和云端授权尚未接通；创建仓库本身不会改变已安装客户端。

## 后续正式发布

1. 在仓库外生成并保管独立 P-256 更新签名私钥；仅公钥打进客户端。
2. 使用源码中的 server/tools/configure-client.cjs 配置实际授权服务地址、本仓库 xjc991114xjc520cjq-source/PSD-Lingo 及独立公钥；该命令会启用正式授权，服务未准备好时不要直接用于本地测试包。
3. 构建新版本，先验证单 EXE 和应用载荷 ZIP。
4. 复制 manifest-template.json，填写真实版本、载荷地址、最低支持版本和 isMandatory。
5. 使用 server/tools/sign-update.cjs 对载荷和清单签名生成 update.json，禁止手工修改已签名清单。
6. 创建版本标签 v版本；上传单 EXE、应用载荷 ZIP、update.json、源码归档、SHA256SUMS.txt。先以草稿核对文件，再发布。
7. 验证匿名下载、校验签名／哈希、安装和授权成功后，才考虑强制更新或提高最低支持版本。

载荷 URL 示例：

https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/download/v0.3.2/PSD-Lingo-app-0.3.2.zip

清单固定 URL：

https://github.com/xjc991114xjc520cjq-source/PSD-Lingo/releases/latest/download/update.json

## 留档原则

每个版本保留原资产，不用同一版本号覆盖不同二进制。安装包是普通用户入口；应用载荷 ZIP 仅用于内置更新器。不要发布任何 API Key、私钥、用户授权缓存、客户文件、.env、.wrangler、node_modules 或本机运行日志。
