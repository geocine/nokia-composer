package main

import "core:math"

INPUT_CAP  :: 8192
MAX_EVENTS :: 4096

Event :: struct #packed {
	freq:     f32,
	gain:     f32,
	duration: f32,
}

input_buf:  [INPUT_CAP]u8
events:     [MAX_EVENTS]Event
events_len: int

@export
input_ptr :: proc() -> uintptr {
	return uintptr(&input_buf[0])
}

@export
input_capacity :: proc() -> i32 {
	return INPUT_CAP
}

@export
events_ptr :: proc() -> uintptr {
	return uintptr(&events[0])
}

@export
events_capacity :: proc() -> i32 {
	return MAX_EVENTS
}

@export
events_count :: proc() -> i32 {
	return i32(events_len)
}

clampi :: proc(x, a, b: i32) -> i32 {
	if x < a {
		return a
	}
	if x > b {
		return b
	}
	return x
}

is_digit :: proc(c: u8) -> bool {
	return c >= '0' && c <= '9'
}

is_note :: proc(c: u8) -> bool {
	return (c >= 'a' && c <= 'g') || c == '-'
}

semitone_index :: proc(note: u8, sharp: bool, octave: i32) -> i32 {
	k := i32(note)
	base := f64(k&7)*1.6 + 8.0
	base = base - 12.0*math.floor(base/12.0)
	n := i32(base)
	if sharp {
		n += 1
	}
	n += 12 * clampi(octave, 1, 3)
	return n
}

push_event :: proc(freq, gain, duration: f32) -> bool {
	if events_len >= MAX_EVENTS {
		return false
	}
	events[events_len] = Event{
		freq = freq,
		gain = gain,
		duration = duration,
	}
	events_len += 1
	return true
}

@export
parse :: proc(bpm: i32, song_len: i32) -> i32 {
	if song_len < 0 {
		events_len = 0
		return -2
	}
	if song_len > INPUT_CAP {
		events_len = 0
		return -2
	}

	bpm_clamped := clampi(bpm, 40, 400)
	events_len = 0

	i := 0
	limit := int(song_len)
	for i < limit {
		start := i

		dur := 0
		has_dur := false
		for i < limit && is_digit(input_buf[i]) {
			has_dur = true
			dur = dur*10 + int(input_buf[i]-'0')
			i += 1
		}

		dotted := false
		if i < limit && input_buf[i] == '.' {
			dotted = true
			i += 1
		}

		sharp := false
		if i < limit && input_buf[i] == '#' {
			sharp = true
			i += 1
		}

		if i >= limit {
			break
		}

		note := input_buf[i]
		if !is_note(note) {
			i = start + 1
			continue
		}
		i += 1

		oct := 0
		has_oct := false
		for i < limit && is_digit(input_buf[i]) {
			has_oct = true
			oct = oct*10 + int(input_buf[i]-'0')
			i += 1
		}

		note_len := 4
		if has_dur {
			note_len = int(clampi(i32(dur), 1, 64))
		}
		octave := 1
		if has_oct {
			octave = int(clampi(i32(oct), 1, 3))
		}

		d := 24.0 / f32(bpm_clamped) / f32(note_len)
		if dotted {
			d *= 1.5
		}

		n := semitone_index(note, sharp, i32(octave))
		freq := f32(261.63 * math.pow(2.0, f64(n)/12.0))

		gain := f32(1.0)
		if note == '-' {
			gain = 0.0
		}

		if !push_event(freq, gain, d*7.0) {
			events_len = 0
			return -1
		}
		if !push_event(freq, 0.0, d*3.0) {
			events_len = 0
			return -1
		}
	}

	return i32(events_len)
}

main :: proc() {}
