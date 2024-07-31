hs.loadSpoon('MenubarCountdown')
hs.loadSpoon('Slack')

REMOTE_CHANNEL = '1_remote'

WORK_START_MESSAGE = '・おはようございます'
WORK_FINISH_MESSAGE = '・終了'
LUNCHBREAK_START_MESSAGE = '・昼休憩します :bento:'
LUNCHBREAK_FINISH_MESSAGE = '・再開'
LUNCHBREAK_STATUS_MESSAGE = '昼休憩中'
LUNCHBREAK_STATUS_EMOJI = ':bento:'

function startWork()
  sendToRemoteChannel(WORK_START_MESSAGE)
end

function startLunchbreak()
  spoon.Slack.toggleAway()
  spoon.Slack.setStatus(LUNCHBREAK_STATUS_MESSAGE, LUNCHBREAK_STATUS_EMOJI)
  sendToRemoteChannel(LUNCHBREAK_START_MESSAGE)
  startLunchbreakCountdown()
end

function finishLunchbreak()
  lunchbreakCountdown:stop()
  spoon.Slack.toggleAway()
  spoon.Slack.clearStatus()
  sendToRemoteChannel(LUNCHBREAK_FINISH_MESSAGE)
end

lunchbreakCountdown = nil

function startLunchbreakCountdown()
  lunchbreakCountdown = spoon.MenubarCountdown.new(
    'Lunchbreak',
    os.time() + 60 * 60,
    {
      onClick = finishLunchbreak
    }
  )
  lunchbreakCountdown:start()
end

function finishWork()
  sendToRemoteChannel(WORK_FINISH_MESSAGE)
end

function sendToRemoteChannel(message)
  spoon.Slack.sendMessageToChannel(REMOTE_CHANNEL, message)
end

menu = hs.menubar.new()

function openMenu()
  return {
    {
      title = "Start Work",
      fn = startWork
    },
    {
      title = "Start Lunchbreak",
      fn = startLunchbreak
    },
    {
      title = "Finish Work",
      fn = finishWork
    }
  }
end

if menu then
  menu:setTitle('Shortcuts')
  menu:setMenu(openMenu)
end

-- Or you could use: hs.chooser
-- Or hotkeys: hs.hotkey.bind
-- Or via Stream Deck Integration: hs.streamdeck
-- Or via command line using: hs.ipc
