# ローカル動作確認ガイド

手元（macOS / Linux）で domain-sentinel を立ち上げて、ドメイン登録・チェック実行まで動かすための手順です。

認証は Cloudflare Access に委譲していますが、`.env` の `CF_ACCESS_*` を空のままにすると **dev モード** となり、全リクエストが合成 ID で通過します。ローカル開発ではこのモードで OK です。

---

## 1. 前提ツール

| ツール | バージョン | 備考 |
|--------|------------|------|
| Node.js | 24.15.0 | `mise.toml` で固定済み |
| npm | 11.x | Node に同梱 |
| mise | 最新 | Node バージョン管理 |
| curl | 任意 | cron エンドポイントの動作確認用 |

### Node のセットアップ

```bash
mise install      # mise.toml の node@24.15.0 を入れる
node -v           # -> v24.15.0
```

---

## 2. 依存インストール

```bash
npm install
```

- `better-sqlite3` のネイティブビルドに 1〜2 分かかることがあります。
- Xcode Command Line Tools（macOS）や build-essential（Linux）が必要です。

---

## 3. 環境変数ファイルを作る

```bash
cp .env.example .env
```

`.env` の中身は基本そのままで動きます。`CRON_SECRET` だけランダム文字列にしておくと丁寧です。

```dotenv
PORT=3030
DATABASE_URL=./data/domain-sentinel.sqlite

# dev モード: 空のままで全リクエスト合成ID通過
CF_ACCESS_TEAM_DOMAIN=
CF_ACCESS_AUD=

CRON_SECRET='（openssl rand -hex 32 の出力）'
```

生成例:

```bash
# .env の CRON_SECRET を書き換える
printf "CRON_SECRET='%s'\n" "$(openssl rand -hex 32)"
```

---

## 4. データベース初期化

```bash
npm run db:migrate
# -> migrations applied
```

`data/domain-sentinel.sqlite` が作成されます。

---

## 5. 開発サーバ起動

```bash
set -a; . ./.env; set +a
npm run dev
# -> [domain-sentinel] listening on http://127.0.0.1:3030
# -> [domain-sentinel] DEV MODE: Cloudflare Access is NOT configured. ...
```

ブラウザで `http://127.0.0.1:3030/` を開けば、ログイン画面なしでそのまま操作できます。右上に `DEV` バッジが表示されるはずです。

---

## 6. 画面操作チェックリスト

1. **ドメイン追加**: 右上の「Add domain」から `google.com` と DKIM セレクタ `20230601` を追加
2. **個別チェック**: 詳細画面の「Check now」→ SPF / DMARC / MX / DKIM の結果が出る
3. **全件チェック**: 一覧上部の「Check all now」→ `/runs` に `manual` エントリ
4. **セレクタ操作**: 詳細画面でセレクタを追加 / 削除
5. **Logout リンク**: dev モードでは単にメッセージが出る（Cloudflare への redirect は本番のみ）

---

## 7. 非画面動作（cron エンドポイント）の確認

```bash
# 拒否（Bearer 無し）
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3030/api/cron/check

# 受理
curl -sS -X POST \
  -H "Authorization: Bearer $(grep ^CRON_SECRET .env | cut -d= -f2- | tr -d \')" \
  http://127.0.0.1:3030/api/cron/check
# -> {"ok":true,"runId":..,"domainCount":..,"errorCount":..}
```

このエンドポイントは **loopback (`127.0.0.1` / `::1`) 以外は 403** です。VPS 上でも systemd timer が localhost 経由で叩く前提で、外部から直接叩くことはできません。

---

## 8. Cloudflare Access を実際に試したい場合

本番相当の認証フローをローカルで確認したい場合は:

1. Cloudflare Zero Trust でテスト用 Tunnel & Application を作成
2. `cloudflared tunnel run --token <token>` をローカルで実行
3. `.env` に `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` を入れて起動
4. Tunnel に紐づいたホスト名にブラウザでアクセス

→ 詳しくは [cloudflare-access-setup.md](./cloudflare-access-setup.md) を参照。

---

## 9. 型検査 / ビルド

```bash
npm run typecheck      # tsc --noEmit
npm run build && npm start
```

---

## 10. よくあるつまづき

| 症状 | 対処 |
|------|------|
| `better-sqlite3` ビルド失敗 | Node を mise 経由の 24.15.0 に合わせる（`node -v`） |
| 起動時に `DEV MODE` が出ない（= 本番モード扱い）なのに画面が開けない | `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` のどちらかが埋まっていないか確認。両方空にすれば dev モード |
| DKIM が常に `fail` | 正しいセレクタ（Google: `20230601`、Microsoft: `selector1` 等）を登録する |
| SPF が `redirect=` で warn にならない | 期待通り。`redirect=` 時は `all` を書かないのが RFC 7208 §6.1 で正しい |

---

## 11. クリーンリセット

```bash
rm -f data/domain-sentinel.sqlite data/domain-sentinel.sqlite-*
npm run db:migrate
```
