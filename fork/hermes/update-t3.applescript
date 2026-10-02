-- "Update T3 Code": restarts T3 Code (Brandon) on the latest build from Zeus.
try
	set output to do shell script "$HOME/.local/bin/t3-update install 2>&1"
	if output contains "Already on" then
		display notification "Already on the latest build." with title "T3 Code (Brandon)"
	else if output contains "Installed" then
		display notification "Updated to the latest build." with title "T3 Code (Brandon)"
	else
		display notification (last paragraph of output) with title "T3 Code (Brandon) update"
	end if
on error errorMessage
	display alert "T3 Code update failed" message errorMessage
end try
