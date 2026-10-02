-- "Update T3 Code": installs the latest build from Zeus if there is one, then
-- opens T3 Code (Brandon). Use it in place of opening the app directly.
try
	set output to do shell script "$HOME/.local/bin/t3-update install 2>&1"
	if output contains "Installed" then
		display notification "Updated to the latest build." with title "T3 Code (Brandon)"
	end if
on error errorMessage
	display notification errorMessage with title "T3 Code update failed; opening the current build"
end try
tell application "T3 Code (Brandon)" to activate
