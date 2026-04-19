# ローカル動作確認ガイド

手元（macOS / Linux）で domain-sentinel を立ち上げて、ログイン・ドメイン登録・チェック実行まで動かすための手順です。

---

## 1. 前提ツール

| ツール | バージョン | 備考 |
|--------|------------|------|
| Node.js | 24.15.0 | `mise.toml` で固定済み |
| npm | 11.x | Node に同梱 |
| mise | 最新 | Node バージョン管理 |
| SQLite | 不要 | `better-sqlite3` がネイティブビルド |
| curl | 任意 | cron エンドポイントの動作確認用 |

### Node のセットアップ

```bash
mise install          # mise.toml の node@24.15.0 を入れる
node -v               # -> v24.15.0
```

mise が未導入なら: https://mise.jdx.dev/

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

次の値を埋めます。

| 変数 | 値の作り方 |
|------|------------|
| `SESSION_SECRET` | 32 文字以上のランダム文字列。例: `openssl rand -hex 32` |
| `CRON_SECRET` | 同上。cron エンドポイント用の共有シークレット |
| `PASSWORD_HASH` | 後述のコマンドで生成する bcrypt ハッシュ |

### パスワードハッシュの生成

```bash
npm run hash-password
# プロンプトが出るのでパスワードを入力（シェル履歴には残りません）
# -> $2a$12$... という文字列が出力される
```

出力された文字列をそのまま `.env` の `PASSWORD_HASH=` に貼り付けます。
ハッシュに `$` が含まれるので、`.env` に書く際はクォートで囲む必要はありません（`dotenv` 形式）。

### `.env` の最終例

```dotenv
PORT=3000
DATABASE_URL=./data/domain-sentinel.sqlite
SESSION_SECRET=7e0f...（openssl rand -hex 32 の出力）
PASSWORD_HASH=$2a$12$uN3e82wAY6NQ0l/8aMIeG.KzYLkXbxFz38pRaRBD7bTidlroBl.KC
CRON_SECRET=5a9c...（openssl rand -hex 32 の出力）
SESSION_TTL_SECONDS=604800
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
npm run dev
# -> [domain-sentinel] listening on http://127.0.0.1:3000
```

ブラウザで `http://127.0.0.1:3000/` を開くと `/login` にリダイレクトされます。
`.env` に設定したパスワードでログインしてください。

---

## 6. 画面操作チェックリスト

以下の順に一通り触れれば MVP 動作は確認完了です。

1. **ログイン**: 誤ったパスワードで 401（画面に "Invalid password"）→ 正しいパスワードで `/` に遷移。
2. **ドメイン追加**: 右上の「Add domain」から `google.com` と DKIM セレクタ `20230601` を追加。
3. **個別チェック**: 一覧行の「Check」ボタン → ドメイン詳細画面で SPF / DMARC / MX / DKIM が pass 系で出ることを確認。
4. **全件チェック**: 一覧上部の「Check all now」→ `/runs` に遷移、Trigger が `manual` で記録される。
5. **セレクタ操作**: 詳細画面でセレクタを追加 / 削除できること。
6. **ログアウト**: 右上の Logout → `/login` に戻る。Cookie が消える。

---

## 7. 非画面動作（cron エンドポイント）の確認

別ターミナルから実行します。

```bash
# 拒否されること (401 unauthorized)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:3000/api/cron/check

# 受け付けられること (200 + JSON)
curl -sS -X POST \
  -H "Authorization: Bearer $(grep ^CRON_SECRET .env | cut -d= -f2-)" \
  http://127.0.0.1:3000/api/cron/check
# -> {"ok":true,"runId":..,"domainCount":..,"errorCount":..}
```

実行後、画面の `/runs` に Trigger=`cron` の行が追加されていれば OK。

---

## 8. 本番ビルドを試す（任意）

`tsx` を外して実ファイルで動かしたい場合:

```bash
npm run build
npm start
# -> node dist/index.js で起動
```

---

## 9. 型検査 / 単発実行

```bash
npm run typecheck      # tsc --noEmit
```

---

## 10. よくあるつまづき

| 症状 | 対処 |
|------|------|
| `The requested module 'bcryptjs' does not provide an export named ...` | `npm ci` で依存を入れ直す。src 側は default import で解決済み |
| ログインフォーム送信で 401 が続く | `.env` の `PASSWORD_HASH` が `$2a$` から始まっているか、改行が入っていないか確認 |
| 起動直後に `SESSION_SECRET is not set` | `.env` を読ませるため `npm run dev` か、`source .env` してから `node dist/index.js` |
| `better-sqlite3` ビルド失敗 | Node を mise 経由の 24.15.0 に合わせる（`node -v` で確認） |
| DKIM が常に `fail` | 対象ドメインの正しいセレクタを登録する必要あり（Google: `20230601`、Microsoft: `selector1` など） |

---

## 11. クリーンリセット

DB をまっさらにしたい場合:

```bash
rm -f data/domain-sentinel.sqlite data/domain-sentinel.sqlite-*
npm run db:migrate
```
