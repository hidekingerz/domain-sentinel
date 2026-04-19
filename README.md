# domain-sentinel

指定ドメインのメール送信ドメイン認証（SPF / DKIM / DMARC / MX）を定期チェックし、Web 画面で確認できる軽量ユーティリティ。

- 対象規模: 10 ドメイン程度
- 実行環境: さくら VPS（Linux）+ Node.js 24 LTS
- フレームワーク: [Hono](https://hono.dev/) + `hono/jsx`（SSR）
- データベース: SQLite（`better-sqlite3`）+ Drizzle ORM
- 認証: パスワード + 署名付きセッション Cookie（JWT / HS256）
- スケジューラ: `systemd` timer（週1回）+ 画面からの手動実行

将来の拡張として、各 RFC（SPF=7208, DKIM=6376, DMARC=7489 ほか）に準拠したレコード検証の差し替えを想定して `RecordChecker` を抽象化しています。

---

## ローカル開発

```bash
mise install            # Node 24.15.0
npm install
cp .env.example .env
npm run hash-password                   # 対話的にパスワードを入力、ハッシュが stdout に出る
# .env の PASSWORD_HASH / SESSION_SECRET / CRON_SECRET を埋める
npm run db:migrate
npm run dev             # http://127.0.0.1:3000
```

### 環境変数

| 変数 | 説明 |
|------|------|
| `PORT` | 待受ポート（既定 3000） |
| `DATABASE_URL` | SQLite ファイルパス |
| `SESSION_SECRET` | セッション JWT 署名鍵（十分に長いランダム文字列） |
| `PASSWORD_HASH` | ログインパスワードの bcrypt ハッシュ |
| `CRON_SECRET` | `/api/cron/check` の共有シークレット |
| `SESSION_TTL_SECONDS` | セッション有効期限（既定 604800 = 7日） |

### 主なスクリプト

- `npm run dev` — tsx watch で起動
- `npm run build` / `npm start` — 本番ビルド・起動
- `npm run db:migrate` — マイグレーション適用
- `npm run hash-password` — bcrypt ハッシュ生成（パスワードは stdin から対話入力）
- `npm run typecheck`

---

## デプロイ（さくら VPS 想定）

前提: Node.js 24 LTS・Caddy 2 系がインストール済み、`domain-sentinel` ユーザを作成済み、アプリを `/opt/domain-sentinel` に配置。

```bash
# 1. 配置
sudo mkdir -p /opt/domain-sentinel/data
sudo chown -R domain-sentinel:domain-sentinel /opt/domain-sentinel
sudo -u domain-sentinel git clone <repo> /opt/domain-sentinel
cd /opt/domain-sentinel
sudo -u domain-sentinel npm ci
sudo -u domain-sentinel npm run build
sudo -u domain-sentinel cp .env.example .env  # 値を埋める
sudo chown root:domain-sentinel /opt/domain-sentinel/.env
sudo chmod 640 /opt/domain-sentinel/.env          # systemd が読み、アプリから読める最小権限
sudo -u domain-sentinel npm run db:migrate

# 2. systemd サービス / タイマー
sudo cp deploy/domain-sentinel.service /etc/systemd/system/
sudo cp deploy/domain-sentinel-cron.service /etc/systemd/system/
sudo cp deploy/domain-sentinel-cron.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now domain-sentinel.service
sudo systemctl enable --now domain-sentinel-cron.timer

# 3. Caddy リバースプロキシ（HTTPS は Let's Encrypt 自動取得）
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # ドメインを置換
sudo systemctl reload caddy
```

### 手動でチェックを走らせる（サーバ側）

```bash
sudo systemctl start domain-sentinel-cron.service
# もしくは
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/check
```

### ログ

```bash
journalctl -u domain-sentinel -f
journalctl -u domain-sentinel-cron -n 50
```

---

## 判定ロジック（MVP）

| チェック | 合格条件 | 警告 |
|----------|----------|------|
| SPF | `v=spf1` TXT が 1 件で末尾が `-all` / `~all` | `?all` / `all` 記述なし |
| DMARC | `_dmarc` に `v=DMARC1` + `p=quarantine\|reject` | `p=none`（監視のみ） |
| MX | 1 件以上存在 | — |
| DKIM | `<selector>._domainkey` に `v=DKIM1` + `p=<公開鍵>` | — |

DNS エラー（NXDOMAIN / SERVFAIL / タイムアウト等）は `error` ステータスで表示します。

## 将来拡張

- RFC 準拠の詳細バリデーション（SPF `include:` の再帰展開、DKIM 鍵強度、DMARC レポート設定など）
- BIMI / ARC などの追加レコード
- 複数ユーザ対応（現状は単一パスワード）
