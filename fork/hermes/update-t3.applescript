-- "Update T3 Code": installs the latest build from Zeus if there is one, then
-- opens T3 Code (Brandon). Also handles t3fork-update:// links, which the
-- sidebar's "Update to latest build" button opens.
on run
	updateT3()
end run

on open location theURL
	updateT3()
end open location

on updateT3()
	try
		set output to do shell script "$HOME/.local/bin/t3-update install 2>&1"
		if output contains "Installed" then
			display notification "Updated to the latest build." with title "T3 Code (Brandon)"
		else if output contains "Already on" then
			display notification "Already on the latest build." with title "T3 Code (Brandon)"
		end if
	on error errorMessage
		display notification errorMessage with title "T3 Code update failed; opening the current build"
	end try
	tell application "T3 Code (Brandon)" to activate
end updateT3
