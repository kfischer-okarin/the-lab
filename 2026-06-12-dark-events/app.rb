# frozen_string_literal: true

require "sinatra/base"
require "json"
require_relative "lib/store"

# Thin HTTP layer over Store. Serves the editor UI and a small JSON API that
# reads and writes the YAML data files directly.
class DarkEventsApp < Sinatra::Base
  set :public_folder, File.expand_path("public", __dir__)
  set :store, Store.new(File.expand_path("data", __dir__))

  helpers do
    def store = settings.store
    def payload = JSON.parse(request.body.read)
    def json_ok(data) = (content_type :json) && data.to_json
    def not_found! = halt(404, { error: "not found" }.to_json)
  end

  before do
    next unless request.path_info.start_with?("/api/")

    content_type :json
    headers "Cache-Control" => "no-store"
  end

  get "/" do
    send_file File.join(settings.public_folder, "index.html")
  end

  get "/api/data" do
    json_ok(store.all)
  end

  # --- events ---------------------------------------------------------------

  post "/api/events" do
    json_ok(store.create_event(payload))
  end

  put "/api/events/:id" do
    json_ok(store.update_event(params[:id], payload) || not_found!)
  end

  delete "/api/events/:id" do
    store.delete_event(params[:id]) || not_found!
    json_ok(ok: true)
  end

  post "/api/reorder" do
    body = payload
    key = store.reorder(
      subject_type: body["subject_type"],
      subject_id: body["subject_id"],
      event_id: body["event_id"],
      before_key: body["before_key"],
      after_key: body["after_key"],
      current_key: body["current_key"]
    )
    key ? json_ok(order: key) : not_found!
  end

  # --- persons ---------------------------------------------------------------

  post "/api/persons" do
    json_ok(store.create_person(payload["name"]))
  end

  put "/api/persons/:id" do
    json_ok(store.update_person(params[:id], payload) || not_found!)
  end

  delete "/api/persons/:id" do
    store.delete_person(params[:id]) || not_found!
    json_ok(ok: true)
  end

  # --- items ------------------------------------------------------------------

  post "/api/items" do
    json_ok(store.create_item(payload["name"]))
  end

  put "/api/items/:id" do
    json_ok(store.update_item(params[:id], payload) || not_found!)
  end

  delete "/api/items/:id" do
    store.delete_item(params[:id]) || not_found!
    json_ok(ok: true)
  end

  run! if app_file == $PROGRAM_NAME
end
