# domain-sentinel

指定ドメインのメール送信ドメイン認証（SPF / DKIM / DMARC / MX）を定期チェックし、Web 画面で確認できる軽量ユーティリティ。

- 対象規模: 10 ドメイン程度
- 実行環境: さくら VPS（Linux）+ Node.js 24 LTS
- フレームワーク: [Hono](https://hono.dev/) + `hono/jsx`（SSR）
- データベース: SQLite（`better-sqlite3`）+ Drizzle ORM
- **認証: Cloudflare Access（Zero Trust Free）+ Cloudflare Tunnel**
  - アプリ側にはログイン画面が無く、Edge で認証
  - VPS は 80/443 を公開しない（cloudflared は outbound 接続のみ）
  - ローカル開発時は dev モード（認証バイパス）
- スケジューラ: `systemd` timer（週1回）+ 画面からの手動実行

将来の拡張として、各 RFC（SPF=7208, DKIM=6376, DMARC=7489 ほか）に準拠したレコード検証の差し替えを想定して `RecordChecker` を抽象化しています。

---

## ローカル開発

```bash
mise install            # Node 24.15.0
npm install
cp .env.example .env    # CF_ACCESS_* は空のままでよい（dev モード）
npm run db:migrate
npm run dev             # http://127.0.0.1:3030
```

`CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` が未設定の場合は自動的に dev モードで起動し、全リクエストが合成 ID (`dev-local`) で通過します。画面右上に `DEV` バッジが出ます。

### 環境変数

| 変数 | 説明 |
|------|------|
| `PORT` | 待受ポート（既定 3030）。loopback のみで listen |
| `DATABASE_URL` | SQLite ファイルパス |
| `CF_ACCESS_TEAM_DOMAIN` | 例: `your-team.cloudflareaccess.com`。空だと dev モード |
| `CF_ACCESS_AUD` | Access Application の AUD Tag。空だと dev モード |
| `CRON_SECRET` | `/api/cron/check` の共有シークレット（loopback のみ） |

### 主なスクリプト

- `npm run dev` — tsx watch で起動
- `npm run build` / `npm start` — 本番ビルド・起動
- `npm run db:migrate` — マイグレーション適用
- `npm run typecheck`

---

## デプロイ（さくら VPS 想定）

### A. アプリ本体

前提: Node.js 24 LTS がインストール済み、`domain-sentinel` ユーザを作成済み、アプリを `/opt/domain-sentinel` に配置。

```bash
sudo mkdir -p /opt/domain-sentinel/data
sudo chown -R domain-sentinel:domain-sentinel /opt/domain-sentinel
sudo -u domain-sentinel git clone <repo> /opt/domain-sentinel
cd /opt/domain-sentinel
sudo -u domain-sentinel npm ci
sudo -u domain-sentinel npm run build
sudo -u domain-sentinel cp .env.example .env    # 値を埋める
sudo chown root:domain-sentinel /opt/domain-sentinel/.env
sudo chmod 640 /opt/domain-sentinel/.env
sudo -u domain-sentinel npm run db:migrate

sudo cp deploy/domain-sentinel.service /etc/systemd/system/
sudo cp deploy/domain-sentinel-cron.service /etc/systemd/system/
sudo cp deploy/domain-sentinel-cron.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now domain-sentinel.service
sudo systemctl enable --now domain-sentinel-cron.timer
```

### B. Cloudflare Access + Tunnel

→ **[docs/cloudflare-access-setup.md](docs/cloudflare-access-setup.md)** の手順に従う。

- Tunnel 作成 → `cloudflared` を VPS に入れて常駐
- Access Application（Self-hosted）+ Allow ポリシー（自分のメールのみ）
- 発行される `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` を `.env` に投入して `domain-sentinel.service` を再起動

### C. ファイアウォール

```bash
sudo ufw default deny incoming
sudo ufw allow ssh
sudo ufw enable
# 80/443 は開けない — Tunnel の outbound 接続で十分
```

### 手動でチェックを走らせる（サーバ側）

```bash
sudo systemctl start domain-sentinel-cron.service
# もしくは loopback から
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3030/api/cron/check
```

### ログ

```bash
journalctl -u domain-sentinel -f
journalctl -u cloudflared -f
```

---

## 判定ロジック（MVP）

| チェック | 合格条件 | 警告 |
|----------|----------|------|
| SPF | `v=spf1` TXT が 1 件で末尾が `-all` / `~all`（`redirect=` の場合は `all` なしで可） | `?all` / `bare all` / 該当なし |
| DMARC | `_dmarc` に `v=DMARC1` + `p=quarantine\|reject` | `p=none` / `sp=none` / `pct<100` |
| MX | 1 件以上存在 | — |
| DKIM | `<selector>._domainkey` に `v=DKIM1` + `p=<公開鍵>` | — |

DNS エラー（NXDOMAIN / SERVFAIL / タイムアウト等）は `error` ステータスで表示します。

## 将来拡張

- RFC 準拠の詳細バリデーション（SPF `include:` の再帰展開、DKIM 鍵強度、DMARC レポート設定など）
- BIMI / ARC などの追加レコード
- Access の group / service token で CI・外部ツールからも叩けるように
