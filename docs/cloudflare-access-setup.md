# Cloudflare Access + Tunnel 設定ガイド

本アプリは認証を Cloudflare Access に全面委譲しています。公開するには以下の手順で Cloudflare Zero Trust をセットアップしてください。

対象ユーザー: 個人利用（〜50 ユーザーの Zero Trust Free プランで十分）。

---

## 前提

- Cloudflare アカウントと、Cloudflare 上で管理している独自ドメイン（例: `yourdomain.com`）
- さくら VPS に `cloudflared` がインストール可能であること
- アプリが `http://127.0.0.1:3030` で動作していること（Caddy は不要になります）

---

## 1. Cloudflare Zero Trust を開く

1. Cloudflare ダッシュボード → 左メニュー **Zero Trust**
2. 初回は Team Name を決める（以後使う `CF_ACCESS_TEAM_DOMAIN` は `<team>.cloudflareaccess.com` になります）
3. プランは **Free** を選択

---

## 2. Tunnel を作成（cloudflared）

1. Zero Trust → **Networks** → **Tunnels** → **Create a tunnel**
2. タイプ: **Cloudflared**
3. 任意の名前（例: `domain-sentinel`）
4. **Tunnel token** が表示されるのでコピー（後で VPS 側に置く）
5. **Public Hostname** タブで以下を設定:
   - Subdomain: `domain-sentinel`
   - Domain: `yourdomain.com`
   - Path: 空
   - Service: `HTTP` / `127.0.0.1:3030`
6. **Save tunnel**

### VPS 側に cloudflared を配置

Debian/Ubuntu 系の場合:

```bash
# cloudflared インストール（Cloudflare 公式リポジトリを追加）
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | \
  sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(. /etc/os-release && echo $VERSION_CODENAME) main" | \
  sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# 専用ユーザ
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cloudflared

# トークンを 0600 で置く
sudo mkdir -p /etc/cloudflared
echo 'TUNNEL_TOKEN=eyJ...（コピーしたトークン）' | sudo tee /etc/cloudflared/domain-sentinel.env >/dev/null
sudo chown root:cloudflared /etc/cloudflared/domain-sentinel.env
sudo chmod 640 /etc/cloudflared/domain-sentinel.env

# systemd unit を配置
sudo cp /opt/domain-sentinel/deploy/cloudflared.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared.service
sudo systemctl status cloudflared.service --no-pager
```

---

## 3. Access Application を作成

1. Zero Trust → **Access** → **Applications** → **Add an application**
2. タイプ: **Self-hosted**
3. Application name: `domain-sentinel`
4. Session duration: 任意（**24 hours** / **1 week** など）
5. Application domain: `domain-sentinel.yourdomain.com`
6. Identity providers: デフォルト（One-time PIN など有効なもの）
7. **Save**（次の画面でポリシーを作る）

### ポリシー設定

**Add a policy**:

- Policy name: `admin`
- Action: **Allow**
- Configure rules:
  - Include → **Emails** → `your-email@example.com` を追加

保存後、アプリケーション詳細画面で **Application Audience (AUD) Tag** が表示されます。これをコピー（後で `.env` に入れる）。

---

## 4. アプリ `.env` に反映

`/opt/domain-sentinel/.env`:

```dotenv
PORT=3030
DATABASE_URL=./data/domain-sentinel.sqlite

# Cloudflare Access（本番では必須）
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD='<AUD Tag をそのまま>'

CRON_SECRET='<openssl rand -hex 32>'
```

再起動:

```bash
sudo systemctl restart domain-sentinel.service
journalctl -u domain-sentinel -n 20
```

`DEV MODE: ...` 警告が**出ないこと**を確認してください。出ている場合は `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` が読み込まれていません。

---

## 5. 動作確認

1. ブラウザで `https://domain-sentinel.yourdomain.com/` にアクセス
2. Cloudflare Access のログイン画面が出る（One-time PIN 等）
3. 認証後、アプリの画面に到達
4. 右上に自分のメールアドレスが表示されていれば OK
5. `Logout` リンクは Cloudflare の `/cdn-cgi/access/logout` にリダイレクトする

---

## 6. 安全性チェックリスト

- [ ] VPS のファイアウォールで 80/443 が**閉じている**（cloudflared は outbound 接続のみ）
- [ ] `.env` と `/etc/cloudflared/domain-sentinel.env` が `chmod 640` 以下
- [ ] Access ポリシーの Include が「自分のメールのみ」になっている
- [ ] Access の **Session duration** を 24 時間～1 週間程度に設定している
- [ ] `domain-sentinel` サービスが `127.0.0.1:3030` のみで listen している（`ss -tlnp`）
- [ ] 未認証アクセスで 401 が返ることを確認（`curl https://domain-sentinel.yourdomain.com/` が 302→Access ログインページ）

---

## 7. サービストークン（cron/外部ツール用）

内部 cron (systemd timer) は loopback 経由で `/api/cron/check` を叩くので Access を通りません。
外部から `/api/cron/check` を叩きたい場合は Access **Service Token** を発行し、`CF-Access-Client-Id` / `CF-Access-Client-Secret` ヘッダを付与してください。Access 側のポリシーに Service Token ルールを追加する必要があります。本リポジトリの内蔵 cron では不要です。
